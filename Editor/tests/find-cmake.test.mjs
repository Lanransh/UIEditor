import test from 'node:test';
import assert from 'node:assert/strict';
import { findCMake } from '../scripts/find-cmake.mjs';

const unavailable = { status: null, stdout: '', error: new Error('not found') };
const version = value => ({ status: 0, stdout: `cmake version ${value}\n` });

test('uses supported PATH CMake without searching other installations', () => {
  const calls = [];
  assert.equal(findCMake({}, 'win32', command => { calls.push(command); return version('3.20.0'); }), 'cmake');
  assert.deepEqual(calls, ['cmake']);
});

test('falls back from old PATH CMake to Visual Studio bundled CMake', () => {
  const result = findCMake({}, 'win32', (command, args) => {
    if (command === 'cmake') return version('3.17.4');
    if (command.endsWith('vswhere.exe')) {
      assert.ok(args.includes('-find'));
      return { status: 0, stdout: 'vs2019/cmake.exe\r\nvs2022/cmake.exe\r\n' };
    }
    if (command === 'vs2019/cmake.exe') return version('3.17.4');
    if (command === 'vs2022/cmake.exe') return version('3.31.6-msvc6');
    return unavailable;
  });
  assert.equal(result, 'vs2022/cmake.exe');
});

test('uses standalone Windows CMake when PATH CMake is missing', () => {
  const result = findCMake({}, 'win32', command => command === 'cmake' ? unavailable : version('4.0.0'));
  assert.ok(result.includes('CMake') && result.endsWith('cmake.exe'));
});

test('honors explicit CMake and rejects an old override without silently replacing it', () => {
  assert.equal(findCMake({ UI_EDITOR_CMAKE: 'custom/cmake.exe' }, 'win32', () => version('3.31.6')), 'custom/cmake.exe');
  const calls = [];
  assert.throws(() => findCMake({ UI_EDITOR_CMAKE: 'custom/cmake.exe' }, 'win32', command => {
    calls.push(command); return version('3.17.4');
  }), /CMake 3\.20\+[\s\S]*custom\/cmake\.exe: cmake version 3\.17\.4/);
  assert.deepEqual(calls, ['custom/cmake.exe']);
});

test('reports missing or unsupported CMake before configuring a build', () => {
  for (const result of [unavailable, version('3.19.9')]) {
    assert.throws(() => findCMake({}, 'linux', () => result), /CMake 3\.20\+ is required/);
  }
});
