import { useState, useRef } from 'react';
import {
  UploadCloud, X, FileUp, AlertCircle, Loader2
} from 'lucide-react';
import {
  parseCustomJson,
  parseCustomExcel,
  extractDocxRawTextFallback,
  parseCustomDocxText,
  decodeLegacyDocBuffer,
} from './utils/customParser';

export default function CustomUploadModal({ show, onClose, onUploadComplete, existingCategories }) {
  const [subjectName, setSubjectName] = useState('');
  const [shortName, setShortName] = useState('');
  const [category, setCategory] = useState('自建题库');
  const [icon, setIcon] = useState('📚');
  const [file, setFile] = useState(null);
  const [previewRows, setPreviewRows] = useState([]);
  const [previewMeta, setPreviewMeta] = useState(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const reset = () => {
    setSubjectName('');
    setShortName('');
    setCategory('自建题库');
    setIcon('📚');
    setFile(null);
    setPreviewRows([]);
    setPreviewMeta(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const parseFileToBank = async (targetFile, subjectId) => {
    const fileName = targetFile.name.toLowerCase();
    if (fileName.endsWith('.json')) {
      const text = await targetFile.text();
      const jsonData = JSON.parse(text);
      return parseCustomJson(jsonData, subjectId);
    }
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const [buf, XLSX] = await Promise.all([
        targetFile.arrayBuffer(),
        import('xlsx'),
      ]);
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1 });
      return parseCustomExcel(raw, subjectId);
    }
    if (fileName.endsWith('.docx')) {
      const [buf, mammoth] = await Promise.all([
        targetFile.arrayBuffer(),
        import('mammoth/mammoth.browser'),
      ]);
      const result = await mammoth.extractRawText({ arrayBuffer: buf });
      let docText = String(result?.value || '').trim();
      if (!docText) {
        docText = await extractDocxRawTextFallback(buf);
      }
      return parseCustomDocxText(docText, subjectId);
    }
    if (fileName.endsWith('.doc')) {
      const buf = await targetFile.arrayBuffer();
      return parseCustomDocxText(decodeLegacyDocBuffer(buf), subjectId);
    }
    throw new Error('不支持的文件格式，请使用 JSON (.json)、Excel (.xlsx / .xls) 或 Word (.docx / .doc) 文件');
  };

  const buildPreview = (parsedBank) => {
    const all = Object.values(parsedBank).flat();
    const rows = all.slice(0, 10).map((q) => {
      let ans = '';
      if (q.type === 'judgment') ans = q.rawAnswer?.[0] === 0 ? '正确' : '错误';
      else if (q.type === 'fill' || q.type === 'big') ans = q.options?.[0] || '';
      else ans = (q.rawAnswer || []).map((i) => String.fromCharCode(65 + i)).join('');
      return { id: q.id, type: q.type, category: q.category, question: q.question, answer: ans };
    });
    return { rows, total: all.length, chapters: Object.keys(parsedBank).length };
  };

  const handlePreview = async () => {
    if (!file) { setError('请先选择题库文件'); return; }
    setUploading(true);
    setError('');
    try {
      const parsedBank = await parseFileToBank(file, 'preview');
      const totalQ = Object.values(parsedBank).flat().length;
      if (totalQ === 0) throw new Error('未解析到有效题目，请检查文件内容格式');
      const { rows, total, chapters } = buildPreview(parsedBank);
      setPreviewRows(rows);
      setPreviewMeta({ total, chapters });
    } catch (err) {
      setPreviewRows([]);
      setPreviewMeta(null);
      setError(err.message || '预览失败');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (uploading) return;
    reset();
    onClose();
  };

  const handleUpload = async () => {
    if (!file) { setError('请选择题库文件'); return; }
    if (!subjectName.trim()) { setError('请输入学科名称'); return; }

    setUploading(true);
    setError('');

    try {
      const subjectId = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const parsedBank = await parseFileToBank(file, subjectId);

      const totalQ = Object.values(parsedBank).flat().length;
      if (totalQ === 0) throw new Error('未解析到有效题目，请检查文件内容格式');

      const chapterEntries = Object.entries(parsedBank);
      const numericBank = {};
      const lectures = [];
      chapterEntries.forEach(([catName, questions], idx) => {
        const chId = idx + 1;
        numericBank[chId] = questions.map((q) => ({ ...q, category: catName, lectureId: chId }));
        lectures.push({ id: chId, name: catName });
      });

      const displayName = subjectName.trim();
      onUploadComplete({
        id: subjectId,
        name: displayName,
        shortName: shortName.trim() || displayName,
        icon,
        category: category.trim() || '自建题库',
        isCustom: true,
        lectures,
        questionCount: totalQ
      }, numericBank);

      reset();
      onClose();
      setTimeout(() => alert('成功导入"' + displayName + '"，共 ' + totalQ + ' 道题目（' + lectures.length + ' 个章节）'), 100);
    } catch (err) {
      setError(err.message || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  if (!show) return null;

  return (
    <div style={{ viewTransitionName: 'modal-backdrop' }} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60" onClick={handleClose}>
      <div style={{ viewTransitionName: 'modal' }} className="bg-white dark:bg-slate-900 w-full h-[100dvh] sm:h-auto sm:max-w-lg md:max-w-4xl sm:max-h-[90vh] overflow-y-auto rounded-none sm:rounded-2xl shadow-2xl transition-all duration-300" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 p-5 sm:p-6 flex justify-between items-start z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 sm:w-12 sm:h-12 bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center shrink-0">
              <UploadCloud size={22} className="sm:w-6 sm:h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-100">上传自定义题库</h2>
              <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500">纯离线解析，数据安全地保存在本地</p>
            </div>
          </div>
          <button onClick={handleClose} disabled={uploading} className="p-1.5 sm:p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors shrink-0">
            <X size={18} className="text-slate-400 sm:w-5 sm:h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 flex flex-col md:grid md:grid-cols-2 md:gap-8 md:items-start space-y-5 md:space-y-0">
          {error && (
            <div className="md:col-span-2 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-400 rounded-xl text-sm flex items-center gap-3">
              <AlertCircle size={18} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 左侧栏：学科配置栏 */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">学科名称 *</label>
              <input type="text" placeholder="例如：高等数学、大学物理" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} disabled={uploading}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">简称（可选）</label>
              <input type="text" placeholder="例如：高数、大物" value={shortName} onChange={(e) => setShortName(e.target.value)} disabled={uploading}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">分类名称 *</label>
              <input type="text" placeholder="例如：自建题库、公共课程、专业课" value={category} onChange={(e) => setCategory(e.target.value)} disabled={uploading} required
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
              {existingCategories && existingCategories.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1 items-center">
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase ml-1">推荐:</span>
                  {existingCategories.filter((c) => c !== '全部').map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      disabled={uploading}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-md text-[10px] font-semibold border-0 cursor-pointer transition-colors"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">图标选择（可选）</label>
              <div className="flex gap-2 flex-wrap max-h-[120px] overflow-y-auto p-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl no-scrollbar">
                {['📚', '📖', '📝', '✏️', '🔬', '🧮', '💻', '⚛️', '🎨', '🌍', '📐', '🔭', '🧬', '🏛️', '📊'].map((emoji) => (
                  <button key={emoji} type="button" onClick={() => setIcon(emoji)} disabled={uploading}
                    className={'w-9 h-9 rounded-xl text-base flex items-center justify-center transition-all ' + (icon === emoji ? 'bg-blue-100 dark:bg-blue-950/60 border-2 border-blue-500 scale-105 shadow-sm' : 'hover:bg-slate-200/60 dark:hover:bg-slate-700')}>
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 右侧栏：文件与提交区 */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">题库文件 *</label>
              <label className={'block border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ' + (file ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800/60' : 'border-slate-300 dark:border-slate-700 hover:border-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800/50')}>
                <input ref={fileInputRef} type="file" accept=".json,.xlsx,.xls,.docx,.doc" onChange={(e) => setFile(e.target.files[0])} disabled={uploading} className="hidden" />
                {file ? (
                  <div className="space-y-1">
                    <FileUp size={24} className="mx-auto text-blue-500 animate-bounce" />
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate max-w-[220px] mx-auto">{file.name}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <UploadCloud size={24} className="mx-auto text-slate-400 dark:text-slate-500" />
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300">点击选择文件</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">支持 JSON、Excel、Word (.docx / .doc)</p>
                  </div>
                )}
              </label>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl p-3.5 space-y-0.5">
              <p className="text-xs font-bold text-amber-800 dark:text-amber-400 flex items-center gap-1">
                <AlertCircle size={12} />
                <span>导入指南</span>
              </p>
              <p className="text-[11px] text-amber-700 dark:text-amber-500 leading-relaxed">
                Excel 须含&quot;题型&quot;、&quot;题干&quot;、&quot;答案&quot;等列名。JSON 支持章节键值或平面数组。Word(.docx/.doc) 支持“题干 + A/B/C/D 选项 + 答案行（答案: X）/括号答案”等常见格式。
              </p>
            </div>

            {previewMeta && (
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 space-y-2">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">导入预览（前10题）</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">共 {previewMeta.total} 题，{previewMeta.chapters} 个章节</p>
                <div className="max-h-44 overflow-y-auto space-y-1.5">
                  {previewRows.map((row, idx) => (
                    <div key={row.id || idx} className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                      <p className="text-[11px] text-slate-500">{row.category} · {row.type}</p>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 line-clamp-2">{idx + 1}. {row.question}</p>
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400">答案：{row.answer || '（空）'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={handleClose} disabled={uploading}
                className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-sm">
                取消
              </button>
              <button onClick={handlePreview} disabled={uploading || !file}
                className="flex-1 py-3 bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 rounded-xl font-bold hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-all text-sm disabled:opacity-50">
                预览解析
              </button>
              <button onClick={handleUpload} disabled={uploading || !file || !subjectName.trim()}
                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all text-sm disabled:opacity-50 flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 dark:shadow-blue-900/20">
                {uploading ? <><Loader2 size={16} className="animate-spin" /> 正在解析...</> : <><UploadCloud size={16} /> 上传并解析</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
