import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs, { mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join, resolve, sep } from 'node:path';
import { createProject, describeError, openProject } from '../electron/projects';
import { listTemplateStyles, previewTemplateStyle, projectStylePath, relocateStyleFile, readTemplateStyle, styleDirectory, templateStylesDirectory } from '../electron/template-styles';
import { robloxStrategy } from '../src/editor/roblox';
import { writeDocument } from '../electron/documents';

async function fixture(t: TestContext) {
  await mkdir(resolve('test-results'), { recursive: true });
  const root = await mkdtemp(resolve('test-results/styles-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const library = join(root, 'TemplateStyles');
  const style = join(library, '定制 风格');
  await mkdir(style, { recursive: true });
  const agents = '# 项目助手\r\n\r\n只沿用作者风格，不用默认规范。\r\n[设计](Game-DESIGN.md)\r\n';
  const design = '# 设计\n\n作者自定义文字规范：GothamBold 30px。\n[窗口](../template-references/窗口/Small.rbxui.json)\n[资源](assets/icon.txt)\n[技能](.agents/skills/check/SKILL.md)\n';
  await writeFile(join(style, 'AGENTS.md'), agents);
  await writeFile(join(style, 'Game-DESIGN.md'), design);
  await writeDocument(join(style, 'template-references', '窗口', 'Small.rbxui.json'), robloxStrategy.createDocument('Small'));
  await mkdir(join(style, 'assets', 'nested'), { recursive: true });
  await writeFile(join(style, 'assets', 'icon.txt'), Buffer.from([0, 128, 255, 42]));
  await writeFile(join(style, 'assets', 'nested', 'more.txt'), 'more');
  await mkdir(join(style, '.agents', 'skills', 'check', 'references'), { recursive: true });
  await writeFile(join(style, '.agents', 'skills', 'check', 'SKILL.md'), '---\r\nname: check\r\ndescription: Style check\r\n---\r\n# 检查\n[规范](../../../Game-DESIGN.md)\n[规则](references/rules.md)\n');
  await writeFile(join(style, '.agents', 'skills', 'check', 'references', 'rules.md'), '自检规则');
  await mkdir(join(style, 'references'));
  await writeFile(join(style, 'references', 'notes.md'), '专项说明');
  await mkdir(join(style, 'Runtime'));
  await writeFile(join(style, 'Runtime', 'secret.txt'), 'not a style');
  await mkdir(join(style, 'assets', 'node_modules'));
  await writeFile(join(style, 'assets', 'node_modules', 'ignored.txt'), 'not a resource');
  await writeFile(join(style, 'assets', 'runtime.log'), 'ignore');
  await writeFile(join(style, 'unrelated.txt'), 'ignore');
  const parent = join(root, '新项目');
  await mkdir(parent);
  return { root, library, style, parent, agents, design };
}

test('发现风格：名称、作者说明、真实模板数量；坏风格可见并反馈，空库可用', async t => {
  const { root, library, style } = await fixture(t);
  await mkdir(join(library, '坏风格'));
  await mkdir(join(library, '.seed-unfinished'));
  const styles = await listTemplateStyles(library);
  const good = styles.find(item => item.id === '定制 风格')!;
  assert.equal(good.name, '定制 风格');
  assert.equal(good.description, '作者自定义文字规范：GothamBold 30px。');
  assert.equal(good.templateCount, 1);
  assert.equal(good.preview?.name, 'Small');
  assert.equal(good.problem, undefined);
  assert.match(styles.find(item => item.id === '坏风格')!.problem!, /Game-DESIGN.md/);
  assert.equal(styles.find(item => item.id === '坏风格')!.preview, undefined);
  assert.equal(styles.length, 2);
  assert.equal(styleDirectory(library, good.id), style);
  for (const id of [null, '', '..', '.', '../outside', 'a/b', 'a\\b', 'C:\\outside']) assert.throws(() => styleDirectory(library, id), /标识无效/);
  assert.deepEqual(await listTemplateStyles(join(root, 'missing')), []);
  await writeFile(join(root, 'not-directory'), 'keep');
  await assert.rejects(listTemplateStyles(join(root, 'not-directory')), /链接或其他文件类型/);
});

test('风格缩略图优先按规范首个模板链接选择，没有链接时稳定排序回退，不依赖固定模板名', async t => {
  const { style, library } = await fixture(t);
  await rm(join(style, 'template-references', '窗口'), { recursive: true });
  await writeDocument(join(style, 'template-references', 'A.rbxui.json'), robloxStrategy.createDocument('FirstFile'));
  await writeDocument(join(style, 'template-references', 'Z.rbxui.json'), robloxStrategy.createDocument('AuthorCover'));
  await writeFile(join(style, 'Game-DESIGN.md'), '# 风格\n\n说明\n[封面](../template-references/Z.rbxui.json)\n[另一个](../template-references/A.rbxui.json)');
  assert.equal((await listTemplateStyles(library))[0].preview?.name, 'AuthorCover');
  await writeFile(join(style, 'Game-DESIGN.md'), '# 风格\n\n说明');
  assert.equal((await listTemplateStyles(library))[0].preview?.name, 'FirstFile');
  assert.equal((await readTemplateStyle(style)).templateCount, 2);
});

test('画风查看返回全部校验过的模板和实际目录，每次重新读盘且不修改原件', async t => {
  const { root, library, style } = await fixture(t);
  const document = robloxStrategy.createDocument('Close');
  await writeDocument(join(style, 'template-references', 'Close.rbxui.json'), document);
  const before = await readTemplateStyle(style);
  const preview = await previewTemplateStyle(library, '定制 风格');
  assert.equal(preview.directory, style);
  assert.deepEqual(preview.templates.map(item => item.path).sort(), ['Close.rbxui.json', join('窗口', 'Small.rbxui.json')].sort());
  assert.deepEqual(preview.templates.find(item => item.path === 'Close.rbxui.json')!.document, document);
  for (const file of before.files) assert.deepEqual(await readFile(join(style, file.path)), file.content);
  document.name = 'UpdatedClose';
  await writeDocument(join(style, 'template-references', 'Close.rbxui.json'), document);
  assert.equal((await previewTemplateStyle(library, '定制 风格')).templates.find(item => item.path === 'Close.rbxui.json')!.document.name, document.name);
  await assert.rejects(previewTemplateStyle(library, '../outside'), /标识无效/);
  await assert.rejects(previewTemplateStyle(library, '不存在'), /无法读取/);
  await writeFile(join(style, 'template-references', 'Close.rbxui.json'), '{}');
  await assert.rejects(previewTemplateStyle(library, '定制 风格'), /模板损坏/);
  await symlink(style, join(root, 'linked'), 'junction');
  await assert.rejects(previewTemplateStyle(root, 'linked'), /链接/);
});

test('整套独立复制：模板子目录、提示词原始字节、文字规范、二进制资源、skills；移动和重开保持相对引用', async t => {
  const { root, style, parent, agents, design } = await fixture(t);
  const { files } = await readTemplateStyle(style);
  const { project } = await createProject(parent, undefined, style);
  assert.deepEqual((await readdir(project.path)).sort(), ['.gitignore', 'AgentWorkspace', 'interfaces', 'project.json']);
  for (const file of files) assert.deepEqual(await readFile(join(project.path, projectStylePath(file.path))), relocateStyleFile(file).content, file.path);
  assert.equal(await readFile(join(project.path, 'AgentWorkspace', 'AGENTS.md'), 'utf8'), await readFile(resolve('../ProjectTypes/Roblox/AGENTS.md'), 'utf8'));
  assert.equal(await readFile(join(project.path, 'AgentWorkspace', 'styles', 'Game-DESIGN.md'), 'utf8'), design.replace('../template-references/', 'templates/').replace('.agents/skills/', 'skills/'));
  assert.ok(files.every(file => !file.path.includes('Runtime') && !file.path.includes('node_modules') && !file.path.endsWith('.log') && file.path !== 'unrelated.txt'));

  const secondParent = join(root, '另一个项目');
  await mkdir(secondParent);
  const second = (await createProject(secondParent, undefined, style)).project;
  await writeFile(join(project.path, 'AgentWorkspace', 'AGENTS.md'), '项目定制入口');
  await writeFile(join(style, 'AGENTS.md'), '全局定制入口');
  assert.equal(await readFile(join(second.path, 'AgentWorkspace', 'AGENTS.md'), 'utf8'), await readFile(resolve('../ProjectTypes/Roblox/AGENTS.md'), 'utf8'));
  assert.equal(await readFile(join(project.path, 'AgentWorkspace', 'AGENTS.md'), 'utf8'), '项目定制入口');
  assert.equal((await openProject(project.path)).manifest.id, project.manifest.id);
  const existing = await createProject(parent, undefined, join(root, 'nonexistent-style'));
  assert.equal(existing.kind, 'existing');
  assert.equal(await readFile(join(project.path, 'AgentWorkspace', 'AGENTS.md'), 'utf8'), '项目定制入口');
  await rename(parent, join(root, '移动后'));
  const moved = await openProject(join(root, '移动后', 'UIEditorWorkspace'));
  assert.deepEqual(moved.manifest, project.manifest);
  assert.equal(await readFile(resolve(moved.path, 'AgentWorkspace', 'styles/templates/窗口/Small.rbxui.json'), 'utf8'), files.find(file => file.path.endsWith('Small.rbxui.json'))!.content.toString());
  assert.equal(await readFile(join(moved.path, 'AgentWorkspace', 'styles', 'skills', 'check', 'references', 'rules.md'), 'utf8'), '自检规则');
});

test('来源缺失、必要文档为空、模板损坏或无模板时回滚；已存在无效目录不覆盖', async t => {
  const { root, style, parent } = await fixture(t);
  await assert.rejects(createProject(parent, undefined, join(root, 'missing')), /无法读取模板风格 missing/);
  assert.deepEqual(await readdir(parent), []);
  await writeFile(join(style, 'Game-DESIGN.md'), ' ');
  await assert.rejects(createProject(parent, undefined, style), /文档为空/);
  assert.deepEqual(await readdir(parent), []);
  await writeFile(join(style, 'Game-DESIGN.md'), '# good');
  const template = join(style, 'template-references', '窗口', 'Small.rbxui.json');
  for (const content of ['{bad', JSON.stringify({ format: 'bad' })]) {
    await writeFile(template, content);
    await assert.rejects(createProject(parent, undefined, style), /模板损坏/);
    assert.equal(await readFile(template, 'utf8'), content);
    assert.deepEqual(await readdir(parent), []);
  }
  await rm(template);
  await assert.rejects(createProject(parent, undefined, style), /没有可读取/);
  assert.deepEqual(await readdir(parent), []);
  await mkdir(join(parent, 'UIEditorWorkspace'));
  await writeFile(join(parent, 'UIEditorWorkspace', 'keep.txt'), 'keep');
  await assert.rejects(createProject(parent, undefined, style), /已存在/);
  assert.equal(await readFile(join(parent, 'UIEditorWorkspace', 'keep.txt'), 'utf8'), 'keep');
  await assert.rejects(createProject(parent, 'recent', style), /不能同时/);
});

test('必要文档必须是普通文件，不把同名目录或模板根目录文件当作制作包', async t => {
  const { style, parent } = await fixture(t);
  await rm(join(style, 'Game-DESIGN.md'));
  await mkdir(join(style, 'Game-DESIGN.md'));
  await writeFile(join(style, 'Game-DESIGN.md', 'fake.txt'), 'not an entry');
  await assert.rejects(createProject(parent, undefined, style), /Game-DESIGN.md.*其他文件类型/);
  assert.deepEqual(await readdir(parent), []);
  await rm(join(style, 'Game-DESIGN.md'), { recursive: true });
  await writeFile(join(style, 'Game-DESIGN.md'), '# AI');
  await rm(join(style, 'template-references'), { recursive: true });
  await writeFile(join(style, 'template-references'), 'not a folder');
  await assert.rejects(createProject(parent, undefined, style), /其他文件类型/);
  assert.deepEqual(await readdir(parent), []);
});

test('拒绝链接根、链接子目录及 skills 父目录联接，不把项目外文件复制进来', async t => {
  const { root, style, parent, library } = await fixture(t);
  const outside = join(root, 'outside');
  await mkdir(outside);
  const linked = join(library, '链接风格');
  await symlink(style, linked, 'junction');
  assert.match((await listTemplateStyles(library)).find(item => item.id === '链接风格')!.problem!, /链接/);
  await assert.rejects(createProject(parent, undefined, linked), /链接/);
  assert.deepEqual(await readdir(parent), []);
  await symlink(outside, join(style, 'assets', 'linked'), 'junction');
  await assert.rejects(createProject(parent, undefined, style), /符号链接/);
  assert.deepEqual(await readdir(parent), []);
  await rm(join(style, 'assets', 'linked'));
  await rm(join(style, '.agents'), { recursive: true });
  await symlink(outside, join(style, '.agents'), 'junction');
  await assert.rejects(createProject(parent, undefined, style), /链接/);
  assert.deepEqual(await readdir(parent), []);
});

test('相对文档引用必须在目标项目闭合，不依赖本机绝对路径或遗漏资源', async t => {
  const { style, parent } = await fixture(t);
  for (const link of ['assets/missing.png', '../../outside.txt', 'C:/external.txt', 'file:///external.txt']) {
    await writeFile(join(style, 'Game-DESIGN.md'), `# AI\n[资源](${link})`);
    await assert.rejects(createProject(parent, undefined, style), /引用/);
    assert.deepEqual(await readdir(parent), []);
  }
  const document = robloxStrategy.createDocument('Image');
  const image = robloxStrategy.createNode('ImageLabel');
  image.imageAssetId = 'source-only-id';
  document.root.children.push(image);
  await writeFile(join(style, 'Game-DESIGN.md'), '# AI');
  await writeDocument(join(style, 'template-references', 'Image.rbxui.json'), document);
  await assert.rejects(createProject(parent, undefined, style), /来源图片库/);
});

test('访问受限明确反馈，复制中途失败清理已创建的文件和目录', async t => {
  const { style, parent, library } = await fixture(t);
  const originalRead = fs.readFile;
  t.mock.method(fs, 'readFile', async (...args: Parameters<typeof fs.readFile>) => {
    if (String(args[0]) === join(style, 'Game-DESIGN.md')) throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
    return originalRead(...args);
  });
  syncBuiltinESMExports();
  assert.match((await listTemplateStyles(library))[0].problem!, /Game-DESIGN.md.*permission denied/);
  await assert.rejects(createProject(parent, undefined, style), /permission denied/);
  assert.deepEqual(await readdir(parent), []);
  t.mock.restoreAll();
  syncBuiltinESMExports();
  const originalOpen = fs.open;
  t.mock.method(fs, 'open', async (...args: Parameters<typeof fs.open>) => {
    if (String(args[0]).endsWith(`${sep}Game-DESIGN.md`)) throw Object.assign(new Error('copy failed'), { code: 'ENOSPC' });
    return originalOpen(...args);
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  await assert.rejects(createProject(parent, undefined, style), error => describeError(error).includes('磁盘空间不足'));
  assert.deepEqual(await readdir(parent), []);
  assert.ok((await readFile(join(style, 'Game-DESIGN.md'), 'utf8')).includes('作者自定义文字规范'));
});

test('打包画风更新后新建工程读取新版，不使用外置旧副本或修改已有工程', async t => {
  const { root, style, agents, design } = await fixture(t);
  const application = join(root, 'ToolRuntime', 'UIEditor-win32-x64');
  const resources = join(application, 'resources', 'TemplateStyles', 'Roblox');
  const external = join(root, 'ToolRuntime', 'TemplateStyles');
  await fs.cp(style, join(resources, '定制 风格'), { recursive: true });
  await fs.cp(style, join(external, '定制 风格'), { recursive: true });
  const active = templateStylesDirectory(true, join(application, 'resources', 'app.asar'), join(application, 'UIEditor.exe'));
  const firstParent = join(root, 'first');
  await mkdir(firstParent);
  const first = (await createProject(firstParent, undefined, styleDirectory(active, '定制 风格'))).project;
  const templatePath = join('template-references', '窗口', 'Small.rbxui.json');
  const originalTemplate = await readFile(join(first.path, projectStylePath(templatePath)));
  const updatedAgents = '# Updated UI assistant\nAll display text must be English. Use the question-mark placeholder for content icons.\n';
  const updatedDesign = '# Updated style\nEnglish-only UI; builtin:roblox:placeholder for all content icons.\n';
  await writeFile(join(resources, '定制 风格', 'AGENTS.md'), updatedAgents);
  await writeFile(join(resources, '定制 风格', 'Game-DESIGN.md'), updatedDesign);
  await writeDocument(join(resources, '定制 风格', templatePath), robloxStrategy.createDocument('UpdatedWindow'));
  assert.equal((await listTemplateStyles(active))[0].description, 'English-only UI; builtin:roblox:placeholder for all content icons.');
  assert.equal((await previewTemplateStyle(active, '定制 风格')).directory, join(resources, '定制 风格'));
  const nextParent = join(root, 'next');
  await mkdir(nextParent);
  const next = (await createProject(nextParent, undefined, styleDirectory(active, '定制 风格'))).project;
  assert.equal(await readFile(join(next.path, 'AgentWorkspace', 'AGENTS.md'), 'utf8'), await readFile(resolve('../ProjectTypes/Roblox/AGENTS.md'), 'utf8'));
  assert.equal(await readFile(join(next.path, 'AgentWorkspace', 'styles', 'Game-DESIGN.md'), 'utf8'), updatedDesign);
  assert.deepEqual(await readFile(join(next.path, projectStylePath(templatePath))), await readFile(join(resources, '定制 风格', templatePath)));
  await openProject(first.path);
  assert.equal(await readFile(join(first.path, 'AgentWorkspace', 'AGENTS.md'), 'utf8'), await readFile(resolve('../ProjectTypes/Roblox/AGENTS.md'), 'utf8'));
  assert.equal(await readFile(join(first.path, 'AgentWorkspace', 'styles', 'Game-DESIGN.md'), 'utf8'), design.replace('../template-references/', 'templates/').replace('.agents/skills/', 'skills/'));
  assert.deepEqual(await readFile(join(first.path, projectStylePath(templatePath))), originalTemplate);
  assert.equal(await readFile(join(external, '定制 风格', 'Game-DESIGN.md'), 'utf8'), design);
});

test('开发直接读取仓库画风，打包直接读取应用资源，不回退到外置目录', async t => {
  const { root, style } = await fixture(t);
  assert.equal(templateStylesDirectory(false, join(root, 'Editor'), join(root, 'electron.exe')), join(root, 'TemplateStyles', 'Roblox'));
  const application = join(root, 'ToolRuntime', 'UIEditor-win32-x64');
  const active = templateStylesDirectory(true, join(application, 'resources', 'app.asar'), join(application, 'UIEditor.exe'));
  assert.equal(active, join(application, 'resources', 'TemplateStyles', 'Roblox'));
  await fs.cp(style, join(root, 'ToolRuntime', 'TemplateStyles', '定制 风格'), { recursive: true });
  assert.deepEqual(await listTemplateStyles(active), []);
  await assert.rejects(previewTemplateStyle(active, '定制 风格'), /无法读取/);
  assert.equal((await listTemplateStyles(join(root, 'ToolRuntime', 'TemplateStyles'))).length, 1);
});

test('随应用提供的 多彩棋格风格：7 个鲜明配色模板和完整工作规则，排除展示页，项目内链接闭合', async t => {
  const { parent } = await fixture(t);
  const root = resolve('../TemplateStyles/Roblox');
  const style = join(root, '多彩棋格风格');
  const styles = await listTemplateStyles(root);
  assert.equal(styles.length, 1);
  assert.equal(styles[0].id, '多彩棋格风格');
  assert.equal(styles[0].problem, undefined);
  assert.equal(styles[0].templateCount, 7);
  assert.equal(styles[0].preview?.root.name, 'SmallWindowUI');
  const { files } = await readTemplateStyle(style);
  const project = (await createProject(parent, undefined, style)).project;
  assert.deepEqual((await readdir(join(project.path, 'AgentWorkspace', 'styles', 'templates'))).sort(), ['CloseButton.rbxui.json', 'LargeWindow.rbxui.json', 'MediumWindow.rbxui.json', 'OperationButtonExamples.rbxui.json', 'ProgressBar.rbxui.json', 'SmallWindow.rbxui.json', 'Title.rbxui.json']);
  for (const file of files) assert.deepEqual(await readFile(join(project.path, projectStylePath(file.path))), relocateStyleFile(file).content);
  const colors: Record<string, string> = {
    TitleImg: '#df1a23', CloseSurfaceImg: '#55ce35',
    ConfirmBtn: '#67ed14', CancelBtn: '#638079', BuyBtn: '#67ed14',
    PaidPurchaseBtn: '#ffd633', EquipBtn: '#67ed14', UnequipBtn: '#f2654d',
    ProgressBarImg: '#571018', ProgressFillImg: '#ff2b35',
  };
  for (const file of files.filter(file => file.path.endsWith('.rbxui.json'))) {
    const document = robloxStrategy.validate(JSON.parse(file.content.toString('utf8')));
    const checkStyle = (node: typeof document.root) => {
      assert.notEqual(node.name, 'BackgroundImg', `${file.path} 不应包含展示背景`);
      if (typeof node.properties.Text === 'string') {
        assert.doesNotMatch(node.properties.Text, /\p{Script=Han}/u, `${file.path} ${node.name} 使用英文文案`);
      }
      if (colors[node.name]) assert.equal(node.properties.BackgroundColor3, colors[node.name], `${file.path} ${node.name}`);
      if (node.name === 'PaidPurchaseBtn') {
        assert.equal(node.children.find(child => child.name === 'BottomEdgeImg')?.properties.BackgroundColor3, '#e58a25');
        assert.ok(!node.children.some(child => child.className === 'UIGradient'), '付费按钮使用纯色，不添加渐变');
      }
      if (['TitleTxt', 'CloseBtn', 'ButtonTxt', 'ProgressTxt'].includes(node.name)) {
        assert.equal(node.properties.TextColor3, '#ffffff', `${file.path} ${node.name} 使用白字描边`);
        assert.equal(node.children.find(child => child.name === 'TextStroke')?.properties.Enabled, true);
      }
      if (node.name === 'CloseBtn') {
        assert.deepEqual(node.properties.Position, { x: { scale: 0, offset: 0 }, y: { scale: 0, offset: -8 } }, `${file.path} 关闭字符补偿字形偏移`);
      }
      node.children.forEach(checkStyle);
    };
    checkStyle(document.root);
  }
  const design = await readFile(join(project.path, 'AgentWorkspace', 'styles', 'Game-DESIGN.md'), 'utf8');
  for (const rule of ['GothamBold', '30', 'CloseSurfaceImg', 'CloseBtn', 'PaidPurchaseBtn', '#FFD633', '#E58A25', '#DF1A23', '标题不固定红色', 'Current / Target']) assert.ok(design.includes(rule), rule);
  const agents = await readFile(join(project.path, 'AgentWorkspace', 'AGENTS.md'), 'utf8');
  for (const content of [design]) {
    for (const rule of ['默认只参考布局', '只有用户明确要求参考配色', '不保留', '英文', '按钮语义色']) assert.ok(content.includes(rule), rule);
  }
  const check = await readFile(join(project.path, 'AgentWorkspace', 'styles', 'skills', 'ui-editor-style-check', 'SKILL.md'), 'utf8');
  for (const content of [design, check]) {
    for (const color of ['#FFD633', '#E58A25']) assert.ok(content.includes(color), color);
    assert.doesNotMatch(content, /付费紫色|紫色用于付费|#D03BF2|#691582/i);
  }
  for (const rule of ['默认只对照布局', '不沿用截图颜色', '原语言已转成英文', '各状态文案均为英文']) assert.ok(check.includes(rule), rule);
});


test('工程类型与风格技能并存；目录或声明同名均拒绝，不留下半成品', async t => {
  const { root, style, parent } = await fixture(t);
  const type = join(root, 'ProjectTypes', 'Roblox');
  await fs.cp(resolve('../ProjectTypes/Roblox'), type, { recursive: true });
  const created = (await createProject(parent, undefined, style, type)).project;
  assert.ok((await readFile(join(created.path, 'AgentWorkspace', '.agents', 'skills', 'roblox-ui-authoring', 'SKILL.md'), 'utf8')).includes('name: roblox-ui-authoring'));
  assert.ok((await readFile(join(created.path, 'AgentWorkspace', 'styles', 'skills', 'check', 'SKILL.md'), 'utf8')).includes('name: check'));
  assert.ok(!(await readTemplateStyle(style)).files.some(file => file.path === 'AGENTS.md'));
  const target = join(root, 'conflict');
  await mkdir(target);
  const skill = join(style, '.agents', 'skills', 'check', 'SKILL.md');
  await writeFile(skill, '---\nname: roblox-ui-authoring\ndescription: conflict\n---\n');
  await assert.rejects(createProject(target, undefined, style, type), /技能同名/);
  assert.deepEqual(await readdir(target), []);
  await writeFile(skill, '---\nname: check\ndescription: check\n---\n');
  await mkdir(join(style, '.agents', 'skills', 'roblox-ui-authoring'));
  await writeFile(join(style, '.agents', 'skills', 'roblox-ui-authoring', 'notes.txt'), 'must not merge into common skill');
  await assert.rejects(createProject(target, undefined, style, type), /冲突/);
  assert.deepEqual(await readdir(target), []);
});

test('空白与历史克隆都有独立平台包；公共包更新只影响新工程；缺失和链接包拒绝', async t => {
  const { root, parent } = await fixture(t);
  const type = join(root, 'ProjectTypes', 'Roblox');
  await fs.cp(resolve('../ProjectTypes/Roblox'), type, { recursive: true });
  const first = (await createProject(parent, undefined, undefined, type)).project;
  const entry = join(first.path, 'AgentWorkspace', 'AGENTS.md');
  const original = await readFile(entry, 'utf8');
  await assert.rejects(readFile(join(first.path, 'AgentWorkspace', 'styles', 'Game-DESIGN.md')), /ENOENT/);
  await writeFile(join(type, 'AGENTS.md'), '# Updated platform entry');
  const nextParent = join(root, 'next');
  await mkdir(nextParent);
  const next = (await createProject(nextParent, first.path, undefined, type)).project;
  assert.equal(await readFile(join(next.path, 'AgentWorkspace', 'AGENTS.md'), 'utf8'), '# Updated platform entry');
  await openProject(first.path);
  assert.equal(await readFile(entry, 'utf8'), original);
  const target = join(root, 'rejected');
  await mkdir(target);
  await assert.rejects(createProject(target, undefined, undefined, join(root, 'missing')), /无法读取/);
  assert.deepEqual(await readdir(target), []);
  const linked = join(root, 'linked-type');
  await symlink(type, linked, 'junction');
  await assert.rejects(createProject(target, undefined, undefined, linked), /链接/);
  assert.deepEqual(await readdir(target), []);
});
