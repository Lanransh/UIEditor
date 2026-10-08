import { useEffect, useRef, useState } from 'react';
import type { CreateProjectSource, RecentProjectView, TemplateStyle } from '../shared/project';
import { DocumentPreview } from './Canvas';
import { robloxStrategy } from './roblox';

export function NewProjectDialog({ recent, onCreate, onCancel }: { recent: RecentProjectView[]; onCreate: (source?: CreateProjectSource) => void; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [source, setSource] = useState<CreateProjectSource>();
  const [styles, setStyles] = useState<TemplateStyle[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let active = true;
    void window.projects.listStyles().then(result => {
      if (!active) return;
      if (result.ok) setStyles(result.value); else setError(result.error);
    }).catch(() => { if (active) setError('无法读取模板风格库，请检查目录权限。'); });
    return () => { active = false; };
  }, []);
  return <dialog ref={dialog} className="new-interface-dialog new-project-dialog" onCancel={onCancel} aria-labelledby="new-project-title">
    <form onSubmit={event => { event.preventDefault(); onCreate(source); }}>
      <h2 id="new-project-title">创建工程</h2>
      <fieldset className="template-source-options" aria-describedby="template-style-help">
        <legend>选择模板风格</legend>
        {error && <p role="alert">{error}</p>}
        {!styles && !error && <p role="status">正在读取风格库…</p>}
        {styles?.length === 0 && <p>暂无风格。请在应用目录旁的 TemplateStyles 中添加完整风格文件夹。</p>}
        <div className="template-source-list">
          <label className={!source ? 'selected' : ''}><input autoFocus type="radio" name="template-source" checked={!source} onChange={() => setSource(undefined)} /><span>空白工程（不使用风格）</span></label>
          {styles?.map(style => <label key={style.id} className={`${source?.kind === 'style' && source.id === style.id ? 'selected' : ''}${style.problem ? ' unavailable' : ''}`}>
            <input type="radio" name="template-source" checked={source?.kind === 'style' && source.id === style.id} disabled={!!style.problem} onChange={() => setSource({ kind: 'style', id: style.id })} />
            <span className="template-style-thumbnail ui-asset-preview ui-document-thumbnail" role="img" aria-label={`${style.name} 缩略图`}>
              {style.preview ? <span className="ui-thumbnail-artboard" aria-hidden="true"><DocumentPreview document={style.preview} strategy={robloxStrategy} /></span>
                : <span className="ui-thumbnail-message">预览不可用</span>}
            </span>
            <span className="template-style-description">{style.name}<small>{style.problem ?? `${style.templateCount} 个模板 · ${style.description}`}</small></span>
          </label>)}
        </div>
      </fieldset>
      <p id="template-style-help">所有新工程都会创建独立的 AI 工作区，包含 Roblox 制作与代码接入技能。选择风格会另外复制视觉规范、模板、资源及专项 skills。现有工程不会被覆盖。</p>
      {recent.length > 0 && <>
      <fieldset className="template-source-options" aria-describedby="template-clone-help">
        <legend>或从历史工程克隆模板（兼容入口）</legend>
        <div className="template-source-list">
          {recent.map(item => <label key={item.path} className={`${source?.kind === 'recent' && source.path === item.path ? 'selected' : ''}${item.problem ? ' unavailable' : ''}`}>
            <input type="radio" name="template-source" checked={source?.kind === 'recent' && source.path === item.path} disabled={!!item.problem} onChange={() => setSource({ kind: 'recent', path: item.path })} />
            <span>{item.name}{item.problem && <small>工程不可用</small>}</span>
          </label>)}
        </div>
      </fieldset>
      <p id="template-clone-help">历史克隆与风格选择互斥，仅从来源工程复制模板参考，不复制来源提示词、项目UI或项目图片。新工程会获得独立的 Roblox AI 工作区。下一步选择新工程的父文件夹。</p>
      </>}
      <div className="new-interface-actions"><button type="button" onClick={onCancel}>取消</button><button type="submit" disabled={!styles && !error}>下一步</button></div>
    </form>
  </dialog>;
}
