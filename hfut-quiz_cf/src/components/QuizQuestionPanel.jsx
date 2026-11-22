import { useRef, useState } from 'react';
import { BookOpen, CheckCircle, CheckSquare, Download, Lightbulb, Loader2, Star, X, XCircle } from 'lucide-react';
import { getQuestionTypeBadgeClass, getQuestionTypeLabel } from '../utils/questionType';
import { getFillHint, gradeFill, parseFillAnswer } from '../utils/fillAnswer';
import {
  downloadFullOfflineDict,
  getTranslateEnabled,
  loadOfflineDict,
  lookupOfflineText,
  setTranslateEnabled,
} from '../utils/offlineDict';

export function QuizQuestionPanel({
  currentQ,
  isQuiz,
  isAnswered,
  selectedIndices,
  fillInputs = [],
  isFavorited,
  onToggleFavorite,
  isMastered,
  onToggleMastered,
  correctStreak = 0,
  masterThreshold = 2,
  onOptionClick,
  onSubmit,
  onFillInputChange,
  onFillSubmit,
}) {
  const inputRefs = useRef([]);
  const questionKey = currentQ?.id ?? currentQ?.question ?? '';
  const [hintState, setHintState] = useState({ key: questionKey, count: 0 });
  const [lookupState, setLookupState] = useState({ key: questionKey, tokenIndex: null, result: null });
  const [translateEnabled, setTranslateEnabledState] = useState(() => getTranslateEnabled());
  const [dictDownloadState, setDictDownloadState] = useState('idle'); // 'idle' | 'downloading' | 'ready' | 'fallback'
  const hintCount = hintState.key === questionKey ? hintState.count : 0;
  const activeLookup = lookupState.key === questionKey ? lookupState : { key: questionKey, tokenIndex: null, result: null };
  const hasEnglishStem = /[A-Za-z]{2,}/.test(String(currentQ?.question || ''));
  const isFillQuiz = isQuiz && currentQ.type === 'fill';
  const blanks = isFillQuiz ? parseFillAnswer(currentQ.options?.[0], currentQ.question) : [];
  const hintInfo = isFillQuiz ? getFillHint(blanks, hintCount) : { hints: [], revealedCount: 0, totalChars: 0, hasMore: false };
  const fillResult = isFillQuiz && isAnswered
    ? gradeFill(blanks.map((_, i) => fillInputs[i] || ''), blanks)
    : { isCorrect: false, perBlank: [] };
  const hasAnyFillInput = isFillQuiz && blanks.some((_, i) => String(fillInputs[i] || '').trim().length > 0);

  const handleToggleTranslate = async () => {
    if (translateEnabled) {
      setTranslateEnabledState(false);
      setTranslateEnabled(false);
      setLookupState({ key: questionKey, tokenIndex: null, result: null });
      return;
    }
    setTranslateEnabledState(true);
    setTranslateEnabled(true);
    setDictDownloadState('downloading');
    try {
      await downloadFullOfflineDict();
      setDictDownloadState('ready');
    } catch {
      await loadOfflineDict();
      setDictDownloadState('fallback');
    }
  };

  const handleTranslateText = async (rawText, tokenIndex = null) => {
    if (!translateEnabled) return;
    const { dict, source } = await loadOfflineDict();
    if (source === 'full') setDictDownloadState('ready');
    const result = lookupOfflineText(rawText, dict);
    if (!result) return;
    setLookupState({ key: questionKey, tokenIndex, result: { ...result, source } });
  };

  const handleQuestionMouseUp = () => {
    if (!translateEnabled) return;
    const selected = window.getSelection?.()?.toString().trim() || '';
    if (!selected || !/[A-Za-z]/.test(selected)) return;
    handleTranslateText(selected, null);
  };

  const questionSegments = translateEnabled
    ? String(currentQ?.question || '').split(/([A-Za-z]+(?:'[A-Za-z]+)?)/g)
    : [];

  return (
    <div className="md:col-span-2 bg-white rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-8 shadow-sm border border-slate-200 animate-enter h-full flex flex-col dark:bg-slate-900 dark:border-slate-800">
      <div className="flex items-center justify-between gap-3 mb-4 md:mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider shrink-0 ${getQuestionTypeBadgeClass(currentQ.type)}`}>
            {`${getQuestionTypeLabel(currentQ.type)}题`}
          </span>
          <span className="text-slate-400 text-xs md:text-sm font-medium flex items-center gap-1 truncate dark:text-slate-500">{currentQ.category}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(hasEnglishStem || translateEnabled) && (
            <button
              type="button"
              onClick={handleToggleTranslate}
              aria-pressed={translateEnabled}
              title={translateEnabled ? '点击关闭划词翻译' : '开启后将下载完整离线词典（约2MB，仅首次需要）'}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all
                ${translateEnabled
                  ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/30 dark:border-blue-800/70 dark:text-blue-300 dark:hover:bg-blue-950/50'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50/60 dark:bg-slate-800/70 dark:border-slate-700 dark:text-slate-400 dark:hover:text-blue-300 dark:hover:border-blue-800/60'}`}
            >
              {dictDownloadState === 'downloading' ? (
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              ) : translateEnabled ? (
                <BookOpen size={14} aria-hidden="true" />
              ) : (
                <Download size={14} aria-hidden="true" />
              )}
              <span>
                {dictDownloadState === 'downloading'
                  ? '下载词典...'
                  : translateEnabled
                    ? (dictDownloadState === 'fallback' ? '划词翻译(基础)' : '划词翻译')
                    : '划词翻译'}
              </span>
            </button>
          )}
          {onToggleMastered && (
            <button
              type="button"
              onClick={onToggleMastered}
              aria-pressed={!!isMastered}
              aria-label={isMastered ? '取消标记已掌握' : '标记为已掌握'}
              title={
                isMastered
                  ? '点击取消已掌握标记'
                  : masterThreshold > 1
                    ? `当前连对 ${correctStreak}/${masterThreshold} 遍，点击可手动标记为已掌握`
                    : '点击标记为已掌握'
              }
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all
                ${isMastered
                  ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100 dark:bg-green-950/30 dark:border-green-800/70 dark:text-green-300 dark:hover:bg-green-950/50'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-green-600 hover:border-green-200 hover:bg-green-50/60 dark:bg-slate-800/70 dark:border-slate-700 dark:text-slate-400 dark:hover:text-green-300 dark:hover:border-green-800/60'}`}
            >
              <CheckCircle size={15} aria-hidden="true" className={isMastered ? 'text-green-600 dark:text-green-400' : ''} />
              <span>
                {isMastered
                  ? '已掌握'
                  : correctStreak > 0 && masterThreshold > 1
                    ? `标记掌握 (${correctStreak}/${masterThreshold})`
                    : '标记掌握'}
              </span>
            </button>
          )}
          {onToggleFavorite && (
            <button
              type="button"
              onClick={onToggleFavorite}
              aria-pressed={!!isFavorited}
              aria-label={isFavorited ? '取消收藏此题' : '收藏此题'}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all
                ${isFavorited
                  ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/30 dark:border-amber-800/70 dark:text-amber-300 dark:hover:bg-amber-950/50'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-amber-600 hover:border-amber-200 hover:bg-amber-50/60 dark:bg-slate-800/70 dark:border-slate-700 dark:text-slate-400 dark:hover:text-amber-300 dark:hover:border-amber-800/60'}`}
            >
              <Star size={15} aria-hidden="true" className={isFavorited ? 'fill-amber-400 text-amber-500 dark:fill-amber-400 dark:text-amber-400' : ''} />
              <span>{isFavorited ? '已收藏' : '收藏'}</span>
            </button>
          )}
        </div>
      </div>
      <h2
        onMouseUp={handleQuestionMouseUp}
        className="text-lg md:text-2xl font-bold text-slate-900 leading-relaxed mb-4 dark:text-slate-100"
      >
        {translateEnabled ? (
          questionSegments.map((seg, idx) => {
            if (!seg) return null;
            if (/^[A-Za-z]+(?:'[A-Za-z]+)?$/.test(seg)) {
              const isSelectedWord = activeLookup.tokenIndex === idx;
              return (
                <span
                  key={idx}
                  onClick={() => {
                    const sel = window.getSelection?.()?.toString().trim() || '';
                    if (sel && sel.toLowerCase() !== seg.toLowerCase()) return;
                    if (isSelectedWord) {
                      setLookupState({ key: questionKey, tokenIndex: null, result: null });
                    } else {
                      handleTranslateText(seg, idx);
                    }
                  }}
                  title="点击查看离线翻译"
                  className={`cursor-pointer rounded px-0.5 transition-colors ${
                    isSelectedWord
                      ? 'bg-blue-100 text-blue-700 underline decoration-blue-400 decoration-dotted underline-offset-4 dark:bg-blue-900/60 dark:text-blue-200'
                      : 'hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-900/40 dark:hover:text-blue-300'
                  }`}
                >
                  {seg}
                </span>
              );
            }
            return <span key={idx}>{seg}</span>;
          })
        ) : (
          currentQ.question
        )}
      </h2>
      {translateEnabled && activeLookup.result && (
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3 text-sm text-slate-800 animate-enter dark:border-blue-800/70 dark:bg-blue-950/30 dark:text-slate-200">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <BookOpen size={15} className="text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="font-bold text-blue-900 dark:text-blue-200">{activeLookup.result.query}</span>
                {activeLookup.result.headword &&
                  activeLookup.result.headword.toLowerCase() !== activeLookup.result.query.toLowerCase() && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      → {activeLookup.result.headword}
                    </span>
                  )}
                {activeLookup.result.phonetic && (
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    /{activeLookup.result.phonetic}/
                  </span>
                )}
                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                  {activeLookup.result.source === 'full' ? '完整离线词典' : '基础离线词典'}
                </span>
              </div>
              <div className="leading-relaxed text-slate-700 dark:text-slate-300">
                {activeLookup.result.meaning}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLookupState({ key: questionKey, tokenIndex: null, result: null })}
              aria-label="关闭翻译"
              className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-blue-100 hover:text-slate-600 dark:hover:bg-blue-900/50 dark:hover:text-slate-200"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
      {isFillQuiz ? (
        <>
          <div className="grid gap-3">
            {blanks.map((_, idx) => (
              <div key={idx} className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">
                  {blanks.length === 1 ? '答案' : `填空${idx + 1}`}
                </label>
                <div className="relative flex items-center">
                  <input
                    ref={(el) => { inputRefs.current[idx] = el; }}
                    type="text"
                    value={fillInputs[idx] || ''}
                    disabled={isAnswered}
                    autoComplete="off"
                    placeholder="请输入答案"
                    onChange={(e) => onFillInputChange?.(idx, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent?.isComposing) {
                        e.preventDefault();
                        if (idx < blanks.length - 1) {
                          inputRefs.current[idx + 1]?.focus();
                        } else if (!isAnswered) {
                          onFillSubmit?.({ usedHint: hintInfo.revealedCount > 0 });
                        }
                      }
                    }}
                    className={`w-full rounded-xl border-2 px-4 py-3 text-sm sm:text-base md:text-lg transition-all outline-none
                      ${isAnswered ? 'pr-11' : ''}
                      ${!isAnswered
                        ? 'border-slate-200 bg-white text-slate-800 focus:border-blue-500 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100 dark:focus:border-blue-500 dark:placeholder:text-slate-500'
                        : fillResult.perBlank[idx]
                          ? 'border-green-500 bg-green-50 text-green-900 dark:border-green-800/80 dark:bg-green-950/20 dark:text-green-200'
                          : 'border-red-500 bg-red-50 text-red-900 dark:border-red-800/80 dark:bg-red-950/20 dark:text-red-200'}`}
                  />
                  {isAnswered && (
                    fillResult.perBlank[idx]
                      ? <CheckCircle className="absolute right-3.5 text-green-500 shrink-0 w-5 h-5 md:w-6 md:h-6 dark:text-green-400" />
                      : <XCircle className="absolute right-3.5 text-red-500 shrink-0 w-5 h-5 md:w-6 md:h-6 dark:text-red-400" />
                  )}
                </div>
              </div>
            ))}
          </div>
          {!isAnswered && hintInfo.revealedCount > 0 && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 animate-enter dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-200">
              <div className="flex items-center gap-2 font-bold mb-1">
                <Lightbulb size={16} className="text-amber-500 dark:text-amber-400 shrink-0" />
                <span>提示（已显示 {hintInfo.revealedCount}/{hintInfo.totalChars} 个字符）</span>
              </div>
              <div className="space-y-1 font-mono text-sm sm:text-base tracking-wide">
                {blanks.length === 1 ? (
                  <div>{hintInfo.hints[0]}</div>
                ) : (
                  hintInfo.hints.map((h, idx) =>
                    h ? <div key={idx}>{`填空${idx + 1}：${h}`}</div> : null
                  )
                )}
              </div>
            </div>
          )}
          {!isAnswered && (
            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 animate-enter pt-4">
              <button
                type="button"
                onClick={() =>
                  setHintState((prev) => ({
                    key: questionKey,
                    count: (prev.key === questionKey ? prev.count : 0) + 1,
                  }))
                }
                disabled={!hintInfo.hasMore}
                className={`w-full sm:w-auto px-5 py-3 rounded-xl font-bold border transition-all flex items-center justify-center gap-2
                  ${hintInfo.hasMore
                    ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/30 dark:border-amber-800/70 dark:text-amber-300 dark:hover:bg-amber-950/50'
                    : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-600'}`}
              >
                <Lightbulb size={18} />
                <span>{hintInfo.revealedCount === 0 ? '提示' : hintInfo.hasMore ? '再提示一个' : '已全部提示'}</span>
              </button>
              <button
                type="button"
                onClick={() => onFillSubmit?.({ usedHint: hintInfo.revealedCount > 0 })}
                disabled={!hasAnyFillInput}
                className={`w-full md:w-auto px-8 py-3 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2
                  ${hasAnyFillInput ? 'bg-blue-600 text-white hover:bg-blue-700 hover:-translate-y-1' : 'bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600'}`}
              >
                确认提交 <CheckSquare size={18} />
              </button>
            </div>
          )}
          {isAnswered && (
            <div className={`mt-4 rounded-xl border-2 p-4 space-y-2 animate-enter ${
              fillResult.isCorrect
                ? 'border-green-500 bg-green-50 text-green-900 dark:border-green-800/80 dark:bg-green-950/20 dark:text-green-200'
                : 'border-red-500 bg-red-50 text-red-900 dark:border-red-800/80 dark:bg-red-950/20 dark:text-red-200'
            }`}>
              <div className="flex items-center gap-2 font-bold text-sm sm:text-base">
                {fillResult.isCorrect
                  ? <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
                  : <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />}
                <span>
                  {fillResult.isCorrect
                    ? (hintInfo.revealedCount > 0 ? '回答正确（已使用提示，不计入掌握）' : '回答正确')
                    : '回答错误'}
                </span>
              </div>
              <div className="text-sm leading-relaxed space-y-1">
                <div className="font-semibold">正确答案：</div>
                {blanks.map((accepted, idx) => (
                  <div key={idx}>
                    {blanks.length === 1 ? accepted.join(' / ') : `填空${idx + 1}：${accepted.join(' / ')}`}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid gap-3">
            {currentQ.options.map((opt, idx) => {
              let status = 'default';
              if (isQuiz) {
                if (isAnswered) {
                  if (currentQ.rawAnswer?.includes(idx)) status = 'correct';
                  else if (selectedIndices.includes(idx)) status = 'wrong';
                  else status = 'dimmed';
                } else if (selectedIndices.includes(idx)) {
                  status = 'selected';
                }
              } else if (currentQ.rawAnswer?.includes(idx)) {
                status = 'correct';
              }

              return (
                <button
                  key={idx}
                  onClick={() => onOptionClick(idx)}
                  className={`w-full p-3.5 sm:p-4 md:p-5 rounded-xl text-left border-2 transition-all flex items-start gap-3 md:gap-4 group relative
                    ${status === 'default' ? 'border-slate-100 bg-white hover:border-blue-200 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-blue-900/60 dark:hover:bg-slate-850' : ''}
                    ${status === 'selected' ? 'border-blue-500 bg-blue-50 text-blue-900 dark:border-blue-800/80 dark:bg-blue-950/20 dark:text-blue-200' : ''}
                    ${status === 'correct' ? 'border-green-500 bg-green-50 text-green-900 dark:border-green-800/80 dark:bg-green-950/20 dark:text-green-200' : ''}
                    ${status === 'wrong' ? 'border-red-500 bg-red-50 text-red-900 dark:border-red-800/80 dark:bg-red-950/20 dark:text-red-200' : ''}
                    ${status === 'dimmed' ? 'bg-white border-slate-100 text-slate-400 dark:bg-slate-900/40 dark:border-slate-850 dark:text-slate-500' : ''}
                    ${status === 'default' ? 'text-slate-700 dark:text-slate-300' : ''}`}
                >
                  <div className={`mt-0.5 w-7 h-7 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[11px] sm:text-xs font-bold border transition-colors shrink-0
                    ${status === 'selected' ? 'bg-blue-500 border-blue-500 text-white dark:bg-blue-600 dark:border-blue-600' : ''}
                    ${status === 'correct' ? 'bg-green-500 border-green-500 text-white dark:bg-green-600 dark:border-green-600' : ''}
                    ${status === 'wrong' ? 'bg-red-500 border-red-500 text-white dark:bg-red-600 dark:border-red-600' : ''}
                    ${status === 'default' || status === 'dimmed' ? 'bg-white border-slate-300 text-slate-500 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-400' : ''}`}
                  >
                    {String.fromCharCode(65 + idx)}
                  </div>
                  <span className="flex-1 text-sm sm:text-base md:text-lg leading-snug">{opt}</span>
                  {status === 'correct' && <CheckCircle className="text-green-500 shrink-0 w-5 h-5 md:w-6 md:h-6 dark:text-green-400" />}
                  {status === 'wrong' && <XCircle className="text-red-500 shrink-0 w-5 h-5 md:w-6 md:h-6 dark:text-red-400" />}
                </button>
              );
            })}
          </div>
          {isQuiz && !isAnswered && currentQ.type === 'multiple' && (
            <div className="flex justify-end animate-enter pt-4">
              <button
                onClick={() => onSubmit()}
                className={`w-full md:w-auto px-8 py-3 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2
                  ${selectedIndices.length > 0 ? 'bg-blue-600 text-white hover:bg-blue-700 hover:-translate-y-1' : 'bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600'}`}
              >
                确认提交 <CheckSquare size={18} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
