#include <Luau/Compiler.h>
#include <lua.h>
#include <lualib.h>
#include <nlohmann/json.hpp>
#include <chrono>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <stdexcept>

using Json = nlohmann::json;
struct Context {
    size_t allocated = 0;
    std::chrono::steady_clock::time_point deadline;
    int arrays = 0;
    size_t values = 0, bytes = 0;
};
static char nullValue;
static void* allocate(void* data, void* pointer, size_t oldSize, size_t size) {
    auto& ctx = *static_cast<Context*>(data);
    if (!pointer) oldSize = 0;
    if (size == 0) { ctx.allocated -= oldSize; std::free(pointer); return nullptr; }
    if (size > 64 * 1024 * 1024 || ctx.allocated - oldSize > 64 * 1024 * 1024 - size) return nullptr;
    void* result = std::realloc(pointer, size);
    if (result) ctx.allocated = ctx.allocated - oldSize + size;
    return result;
}
static void interrupt(lua_State* L, int) {
    auto* ctx = static_cast<Context*>(lua_callbacks(L)->userdata);
    if (std::chrono::steady_clock::now() > ctx->deadline) luaL_error(L, "Execution exceeded 250 ms");
}
static void push(lua_State* L, const Json& value, Context& ctx, bool readonly = false) {
    if (!lua_checkstack(L, 4)) throw std::runtime_error("Insufficient Luau stack for data");
    if (value.is_null()) lua_pushlightuserdata(L, &nullValue);
    else if (value.is_boolean()) lua_pushboolean(L, value.get<bool>());
    else if (value.is_number()) lua_pushnumber(L, value.get<double>());
    else if (value.is_string()) { auto str = value.get<std::string>(); lua_pushlstring(L, str.data(), str.size()); }
    else {
        lua_newtable(L);
        if (value.is_array()) {
            int array = lua_gettop(L);
            lua_getref(L, ctx.arrays); lua_pushvalue(L, array); lua_pushboolean(L, true); lua_rawset(L, -3); lua_pop(L, 1);
            int index = 1;
            for (auto& item : value) { push(L, item, ctx, readonly); lua_rawseti(L, -2, index++); }
        } else {
            for (auto it = value.begin(); it != value.end(); ++it) {
                lua_pushlstring(L, it.key().data(), it.key().size()); push(L, it.value(), ctx, readonly); lua_rawset(L, -3);
            }
        }
        if (readonly) lua_setreadonly(L, -1, true);
    }
}
static Json read(lua_State* L, int index, Context& ctx, int depth = 0) {
    if (!lua_checkstack(L, 4)) throw std::runtime_error("Insufficient Luau stack for data");
    if (depth > 64) throw std::runtime_error("Data exceeds 64 levels or contains a cycle");
    if (++ctx.values > 100000 || std::chrono::steady_clock::now() > ctx.deadline) throw std::runtime_error("Data serialization exceeded its budget");
    index = lua_absindex(L, index);
    switch (lua_type(L, index)) {
    case LUA_TNIL: return nullptr;
    case LUA_TLIGHTUSERDATA:
        if (lua_touserdata(L, index) == &nullValue) return nullptr;
        break;
    case LUA_TBOOLEAN: return bool(lua_toboolean(L, index));
    case LUA_TNUMBER: {
        double number = lua_tonumber(L, index);
        if (!std::isfinite(number)) throw std::runtime_error("Data contains a non-finite number");
        return number;
    }
    case LUA_TSTRING: {
        size_t size; const char* str = lua_tolstring(L, index, &size);
        ctx.bytes += size;
        if (ctx.bytes > 8 * 1024 * 1024) throw std::runtime_error("Serialized data exceeds 8 MiB");
        return std::string(str, size);
    }
    case LUA_TTABLE: {
        // Empty tables are objects unless they originated from a JSON array.
        lua_getref(L, ctx.arrays); lua_pushvalue(L, index); lua_rawget(L, -2);
        bool array = lua_toboolean(L, -1) || lua_objlen(L, index) > 0;
        lua_pop(L, 2);
        Json result = array ? Json::array() : Json::object();
        size_t count = 0;
        lua_pushnil(L);
        while (lua_next(L, index)) {
            if (array) {
                if (lua_type(L, -2) != LUA_TNUMBER || lua_tonumber(L, -2) < 1 || lua_tonumber(L, -2) != std::floor(lua_tonumber(L, -2))) throw std::runtime_error("Expected a contiguous array");
            } else {
                if (lua_type(L, -2) != LUA_TSTRING) throw std::runtime_error("Object keys must be strings");
                auto key = read(L, -2, ctx, depth + 1).get<std::string>();
                result[key] = read(L, -1, ctx, depth + 1);
            }
            ++count; lua_pop(L, 1);
        }
        if (array) {
            if (count != size_t(lua_objlen(L, index))) throw std::runtime_error("Expected a contiguous array");
            for (size_t i = 1; i <= count; ++i) { lua_rawgeti(L, index, int(i)); result.push_back(read(L, -1, ctx, depth + 1)); lua_pop(L, 1); }
        }
        return result;
    }
    }
    throw std::runtime_error("Data must be serializable (no functions or userdata)");
}
static void check(lua_State* L, int status) {
    if (status) throw std::runtime_error(lua_tostring(L, -1) ? lua_tostring(L, -1) : "Luau execution failed");
}
static int errorTrace(lua_State* L) {
    const char* message = lua_tostring(L, 1);
    lua_pushfstring(L, "%s\n%s", message ? message : "Luau execution failed", lua_debugtrace(L));
    return 1;
}
static void call(lua_State* L, int arguments, int results) {
    int handler = lua_gettop(L) - arguments;
    lua_pushcfunction(L, errorTrace, "errorTrace"); lua_insert(L, handler);
    int status = lua_pcall(L, arguments, results, handler);
    lua_remove(L, handler);
    check(L, status);
}
static void load(lua_State* L, const std::string& source, const char* name, int environment = 0) {
    auto bytecode = Luau::compile(source);
    check(L, luau_load(L, name, bytecode.data(), bytecode.size(), environment));
}
static void hostCall(lua_State* L, int host, const char* name, int arguments) {
    int base = lua_gettop(L) - arguments;
    lua_getref(L, host); lua_getfield(L, -1, name); lua_remove(L, -2); lua_insert(L, base + 1);
    call(L, arguments, 1);
}
static int environment(lua_State* L, int host, int ui = 0) {
    lua_newtable(L);
    int env = lua_gettop(L);
    if (ui) { lua_getref(L, ui); lua_setfield(L, env, "UI"); }
    lua_pushlightuserdata(L, &nullValue); lua_setfield(L, env, "JSONNull");
    lua_getref(L, host); lua_getfield(L, -1, "print"); lua_remove(L, -2); lua_setfield(L, env, "print");
    lua_newtable(L); lua_pushvalue(L, LUA_GLOBALSINDEX); lua_setfield(L, -2, "__index"); lua_setreadonly(L, -1, true); lua_setmetatable(L, env);
    lua_setreadonly(L, env, true);
    return env;
}
int main() {
    Context ctx;
    ctx.deadline = std::chrono::steady_clock::now() + std::chrono::seconds(2);
    lua_State* L = lua_newstate(allocate, &ctx);
    if (!L) return 1;
    lua_callbacks(L)->userdata = &ctx;
    lua_callbacks(L)->interrupt = interrupt;
    luaL_openlibs(L);
    lua_newtable(L); lua_newtable(L); lua_pushstring(L, "k"); lua_setfield(L, -2, "__mode"); lua_setmetatable(L, -2);
    ctx.arrays = lua_ref(L, -1); lua_pop(L, 1);
    for (const char* name : { "_G", "print", "getfenv", "setfenv", "loadstring", "collectgarbage", "newproxy", "require" }) { lua_pushnil(L); lua_setglobal(L, name); }
    luaL_sandbox(L);
    int host = 0;
    std::string line;
    while (std::getline(std::cin, line)) {
        try {
            if (line.size() > 8 * 1024 * 1024) throw std::runtime_error("Runtime message exceeds 8 MiB");
            Json input = Json::parse(line);
            ctx.deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(250);
            ctx.values = ctx.bytes = 0;
            if (input["type"] == "start") {
                load(L, input["bootstrap"], "=host"); call(L, 0, 1); host = lua_ref(L, -1); lua_pop(L, 1);
                int env = environment(L, host);
                load(L, input["config"], "=config", env); call(L, 0, 1);
                if (!lua_istable(L, -1)) throw std::runtime_error("Config must return a table");
                Json config = read(L, -1, ctx); lua_settop(L, 0);
                push(L, input, ctx); push(L, config, ctx, true); hostCall(L, host, "prepare", 2);
                int ui = lua_ref(L, -1); lua_settop(L, 0);
                env = environment(L, host, ui);
                load(L, input["source"], "=interface", env); call(L, 0, 0); lua_settop(L, 0);
                hostCall(L, host, "start", 0); lua_settop(L, 0);
            } else if (input["type"] == "stop") {
                hostCall(L, host, "dispose", 0); lua_settop(L, 0);
            } else {
                push(L, input, ctx, input["type"] == "state"); hostCall(L, host, "command", 1); lua_settop(L, 0);
            }
            hostCall(L, host, "output", 0); Json output = read(L, -1, ctx); lua_settop(L, 0);
            for (const char* key : { "operations", "disabled", "logs" }) if (output[key].is_object() && output[key].empty()) output[key] = Json::array();
            auto response = Json({ { "ok", true }, { "value", output } }).dump();
            if (response.size() > 8 * 1024 * 1024) throw std::runtime_error("Runtime output exceeds 8 MiB");
            std::cout << response << std::endl;
            if (input["type"] == "stop") break;
        } catch (const std::exception& error) {
            std::cout << Json({ { "ok", false }, { "error", error.what() } }).dump(-1, ' ', false, Json::error_handler_t::replace) << std::endl;
            break;
        }
    }
    lua_close(L);
}
