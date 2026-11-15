import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Code2,
  Image as ImageIcon,
  MessageSquare,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  ChatMessage,
  ChatRolePreset,
  GeminiModelId,
  HardwareCommandProposal,
  LanguageCode,
} from '../types/studio';

interface GeminiChatPanelProps {
  boardId: string;
  language: LanguageCode;
  activeCode?: string;
  compactDrawer?: boolean;
  onAuthorizeCommand: (command: string) => Promise<{ ok: boolean; ack: string }>;
  onInsertFirmware: (code: string, filename?: string) => void;
}

export function GeminiChatPanel({
  boardId,
  language,
  activeCode,
  compactDrawer = false,
  onAuthorizeCommand,
  onInsertFirmware,
}: GeminiChatPanelProps) {
  const [subTab, setSubTab] = useState<'chat' | 'vision' | 'visuals'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState<GeminiModelId>('gemini-4-hydrogen');
  const [rolePreset, setRolePreset] = useState<ChatRolePreset>('architect');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [chatImage, setChatImage] = useState<{ base64: string; mimeType: string; name: string } | null>(null);

  // Vision Assistant state
  const [visionFile, setVisionFile] = useState<{ base64: string; mimeType: string; name: string } | null>(null);
  const [visionPrompt, setVisionPrompt] = useState('');
  const [visionLoading, setVisionLoading] = useState(false);
  const [visionResult, setVisionResult] = useState<{
    summary: string;
    identifiedComponents: string[];
    visuallyInferredConnections: string[];
    verifiedElectricalNotes: string[];
    wiringWarnings: string[];
    suggestedFirmware: string;
  } | null>(null);

  // Image Generation Studio state (gemini-3-pro-image-preview with 1K, 2K, 4K)
  const [imgPrompt, setImgPrompt] = useState(
    'Isometric cutaway of an ESP32 smart home relay enclosure with OLED status screen on an engineering workbench'
  );
  const [imgSize, setImgSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [imgAspect, setImgAspect] = useState<'16:9' | '4:3' | '1:1'>('16:9');
  const [imgLoading, setImgLoading] = useState(false);
  const [generatedImg, setGeneratedImg] = useState<{ imageDataUrl: string; caption: string } | null>(null);

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch('/api/ai/chat/history?sessionId=default')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setMessages(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending]);

  const handleFileToBase64 = (
    file: File,
    cb: (res: { base64: string; mimeType: string; name: string }) => void
  ) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const commaIdx = result.indexOf(',');
      const base64 = commaIdx >= 0 ? result.slice(commaIdx + 1) : result;
      cb({ base64, mimeType: file.type || 'image/png', name: file.name });
    };
    reader.readAsDataURL(file);
  };

  const handleSendChat = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || sending) return;
    setErrorMsg(null);
    setSending(true);
    if (!overrideText) setInput('');

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'default',
          model,
          message: text,
          rolePreset,
          language,
          boardId,
          activeCode,
          imageBase64: chatImage?.base64,
          imageMimeType: chatImage?.mimeType,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to get response from Gemini.');
      }
      setMessages((prev) => [...prev, data.userMessage, data.assistantMessage]);
      setChatImage(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Chat request failed');
    } finally {
      setSending(false);
    }
  };

  const handleClearHistory = async () => {
    await fetch('/api/ai/chat/history?sessionId=default', { method: 'DELETE' });
    setMessages([]);
  };

  const handleProposalAction = async (
    msgId: string,
    proposal: HardwareCommandProposal,
    approve: boolean
  ) => {
    if (!approve) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                commandProposals: m.commandProposals?.map((p) =>
                  p.id === proposal.id ? { ...p, status: 'rejected', ackMessage: 'Rejected by user' } : p
                ),
              }
            : m
        )
      );
      return;
    }

    const result = await onAuthorizeCommand(proposal.command);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? {
              ...m,
              commandProposals: m.commandProposals?.map((p) =>
                p.id === proposal.id
                  ? {
                      ...p,
                      status: result.ok ? 'executed' : 'error',
                      ackMessage: result.ack,
                    }
                  : p
              ),
            }
          : m
      )
    );
  };

  const handleRunVision = async () => {
    if (!visionFile || visionLoading) return;
    setErrorMsg(null);
    setVisionLoading(true);
    try {
      const res = await fetch('/api/ai/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64Data: visionFile.base64,
          mimeType: visionFile.mimeType,
          prompt: visionPrompt,
          boardId,
          language,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Vision analysis failed.');
      setVisionResult(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Vision request failed.');
    } finally {
      setVisionLoading(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!imgPrompt.trim() || imgLoading) return;
    setErrorMsg(null);
    setImgLoading(true);
    try {
      const res = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imgPrompt,
          imageSize: imgSize,
          aspectRatio: imgAspect,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Image generation failed.');
      setGeneratedImg(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Image generation failed.');
    } finally {
      setImgLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800">
      {/* Header & Sub-Tabs */}
      <div className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-900 rounded-lg min-w-0">
          <button
            type="button"
            onClick={() => setSubTab('chat')}
            className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
              subTab === 'chat'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <MessageSquare className="w-3 h-3 shrink-0" />
            AI Chat
          </button>
          <button
            type="button"
            onClick={() => setSubTab('vision')}
            className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
              subTab === 'vision'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Camera className="w-3 h-3 shrink-0" />
            Vision Lab
          </button>
          <button
            type="button"
            onClick={() => setSubTab('visuals')}
            className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
              subTab === 'visuals'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ImageIcon className="w-3 h-3 shrink-0" />
            3D/PCB Visuals
          </button>
        </div>

        {subTab === 'chat' && (
          <button
            type="button"
            onClick={handleClearHistory}
            title="Clear conversation history"
            aria-label="Clear conversation history"
            className="p-1.5 rounded text-slate-400 hover:text-rose-500 transition-colors shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="mx-4 mt-3 p-3 rounded-lg border border-rose-500/40 bg-rose-500/10 text-xs text-rose-700 dark:text-rose-300 flex items-start justify-between gap-2">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} aria-label="Dismiss error">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* CHAT TAB */}
      {subTab === 'chat' && (
        <>
          <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-2 text-xs">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Gemini Model</span>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as GeminiModelId)}
                className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs"
              >
                <option value="gemini-4-hydrogen">gemini-4-hydrogen (General)</option>
                <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Fast)</option>
                <option value="gemini-4-argon">gemini-4-argon (Complex)</option>
                <option value="gemini-4-carbon">gemini-4-carbon (Deep Reasoning)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Assistant Role</span>
              <select
                value={rolePreset}
                onChange={(e) => setRolePreset(e.target.value as ChatRolePreset)}
                className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs"
              >
                <option value="architect">Firmware Architect</option>
                <option value="debugger">Circuit Debugger</option>
                <option value="commander">Hardware Commander</option>
                <option value="tutor">Bilingual Tutor (EN/BM)</option>
              </select>
            </label>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="space-y-3 py-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {language === 'ms'
                    ? 'Tanya Gemini tentang kod Arduino, litar ESP32, ralat kompilasi, atau kawalan perkakasan GPIO.'
                    : 'Ask Gemini about Arduino C++ firmware, ESP32/STM32 pinouts, compilation errors, or hardware serial commands.'}
                </p>
                <div className="flex flex-col gap-2">
                  {[
                    'Turn on LED connected to GPIO 2.',
                    'Generate non-blocking DHT22 + Relay firmware for ESP32.',
                    language === 'ms'
                      ? 'Terangkan cara kira perintang LED 5V dalam Bahasa Melayu.'
                      : 'Explain how to wire an HC-SR04 5V sensor safely to a 3.3V ESP32.',
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => handleSendChat(prompt)}
                      className="text-left px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 hover:border-sky-500/60 transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col gap-1.5 ${m.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {m.role === 'user' ? 'Engineer' : `Gemini${m.model ? ` · ${m.model}` : ''}`}
                </div>
                <div
                  className={`max-w-[92%] rounded-lg px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {m.imageAttachment && (
                    <img
                      src={m.imageAttachment}
                      alt="Uploaded circuit attachment"
                      referrerPolicy="no-referrer"
                      className="max-h-40 rounded mb-2 border border-slate-300 dark:border-slate-700"
                    />
                  )}
                  {m.content}
                </div>

                {/* Hardware Command Authorization Cards */}
                {m.commandProposals && m.commandProposals.length > 0 && (
                  <div className="w-full max-w-[92%] space-y-2 mt-1">
                    {m.commandProposals.map((prop) => (
                      <div
                        key={prop.id}
                        className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-300">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Hardware Command Authorization
                          </span>
                          <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
                            {prop.targetBoardId}
                          </span>
                        </div>
                        <div className="font-mono px-2.5 py-1.5 rounded bg-slate-950 text-sky-400 text-xs">
                          {prop.command}
                        </div>
                        <p className="text-slate-700 dark:text-slate-300">{prop.description}</p>
                        {prop.status === 'pending' ? (
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => handleProposalAction(m.id, prop, true)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-colors"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Authorize & Send
                            </button>
                            <button
                              type="button"
                              onClick={() => handleProposalAction(m.id, prop, false)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                              Reject
                            </button>
                          </div>
                        ) : (
                          <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                            Status: {prop.status.toUpperCase()} {prop.ackMessage ? `(${prop.ackMessage})` : ''}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {sending && (
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Gemini is analyzing hardware context...
              </div>
            )}
            <div ref={threadEndRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendChat();
            }}
            className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2"
          >
            {chatImage && (
              <div className="flex items-center justify-between px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-900 text-xs">
                <span className="truncate">{chatImage.name}</span>
                <button type="button" onClick={() => setChatImage(null)} aria-label="Remove attachment">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <label
                title="Attach schematic or circuit photo"
                className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer shrink-0"
              >
                <Upload className="w-4 h-4" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileToBase64(file, setChatImage);
                  }}
                />
              </label>
              <textarea
                rows={compactDrawer ? 2 : 3}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendChat();
                  }
                }}
                placeholder={
                  language === 'ms'
                    ? 'Tanya tentang kod, pinout, atau arahan GPIO...'
                    : 'Ask about firmware, circuits, or GPIO commands...'
                }
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 resize-none focus:outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                aria-label="Send message"
                className="p-2.5 rounded-lg bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-50 transition-colors shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </>
      )}

      {/* VISION ASSISTANT TAB */}
      {subTab === 'vision' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Gemini Vision Circuit & Datasheet Inspector
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Upload circuit photos, PCB shots, wiring diagrams, or datasheet PDFs. Analysis strictly separates visually inferred connections from verified electrical rules.
            </p>
          </div>

          <label className="block p-4 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-center cursor-pointer hover:border-sky-500 transition-colors">
            <Upload className="w-5 h-5 mx-auto text-slate-400" />
            <div className="mt-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
              {visionFile ? visionFile.name : 'Select Circuit Photo, Schematic PNG/JPG, or Datasheet PDF'}
            </div>
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileToBase64(file, setVisionFile);
              }}
            />
          </label>

          <input
            type="text"
            value={visionPrompt}
            onChange={(e) => setVisionPrompt(e.target.value)}
            placeholder="Optional focus (e.g., Check if LED resistor is missing or verify I2C wiring)"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
          />

          <button
            type="button"
            disabled={!visionFile || visionLoading}
            onClick={handleRunVision}
            className="w-full py-2 px-4 rounded-lg bg-sky-600 text-white text-xs font-medium hover:bg-sky-500 disabled:opacity-50 transition-colors"
          >
            {visionLoading ? 'Analyzing Circuit Media...' : 'Analyze Circuit & Generate Firmware'}
          </button>

          {visionResult && (
            <div className="space-y-3 pt-2 text-xs">
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                <div className="font-semibold text-slate-900 dark:text-slate-100">Summary</div>
                <p className="mt-1 text-slate-600 dark:text-slate-300">{visionResult.summary}</p>
              </div>

              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="font-semibold text-slate-900 dark:text-slate-100">Identified Components</div>
                <ul className="mt-1 list-disc pl-4 space-y-0.5 text-slate-600 dark:text-slate-300">
                  {visionResult.identifiedComponents.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>

              <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/5">
                <div className="font-semibold text-amber-700 dark:text-amber-300">
                  Visually Inferred Connections (Verify Physically)
                </div>
                <ul className="mt-1 list-disc pl-4 space-y-0.5 text-slate-700 dark:text-slate-300">
                  {visionResult.visuallyInferredConnections.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>

              <div className="p-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5">
                <div className="font-semibold text-emerald-700 dark:text-emerald-300">
                  Verified Electrical Rules & Requirements
                </div>
                <ul className="mt-1 list-disc pl-4 space-y-0.5 text-slate-700 dark:text-slate-300">
                  {visionResult.verifiedElectricalNotes.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>

              {visionResult.wiringWarnings.length > 0 && (
                <div className="p-3 rounded-lg border border-rose-500/40 bg-rose-500/5">
                  <div className="font-semibold text-rose-700 dark:text-rose-300">Potential Wiring Errors</div>
                  <ul className="mt-1 list-disc pl-4 space-y-0.5 text-slate-700 dark:text-slate-300">
                    {visionResult.wiringWarnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {visionResult.suggestedFirmware && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">Compatible Firmware</span>
                    <button
                      type="button"
                      onClick={() => onInsertFirmware(visionResult.suggestedFirmware, 'VisionGenerated.ino')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-sky-600 text-white font-medium hover:bg-sky-500"
                    >
                      <Code2 className="w-3.5 h-3.5" />
                      Load in IDE
                    </button>
                  </div>
                  <pre className="p-3 rounded-lg bg-slate-950 text-slate-100 font-mono text-[11px] overflow-x-auto">
                    {visionResult.suggestedFirmware}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* HARDWARE IMAGE GENERATION STUDIO (1K / 2K / 4K via gemini-3-pro-image-preview) */}
      {subTab === 'visuals' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Hardware Concept & Enclosure Visual Studio
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Generate high-resolution hardware enclosure concepts, PCB layout mockups, and wiring renders with gemini-3-pro-image-preview.
            </p>
          </div>

          <textarea
            rows={3}
            value={imgPrompt}
            onChange={(e) => setImgPrompt(e.target.value)}
            placeholder="Describe the hardware enclosure, PCB, or project render..."
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
          />

          <div className="grid grid-cols-2 gap-3 text-xs">
            <label className="flex flex-col gap-1">
              <span className="text-slate-500 dark:text-slate-400">Image Resolution</span>
              <select
                value={imgSize}
                onChange={(e) => setImgSize(e.target.value as '1K' | '2K' | '4K')}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              >
                <option value="1K">1K (Standard)</option>
                <option value="2K">2K (High Detail)</option>
                <option value="4K">4K (Ultra HD)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-slate-500 dark:text-slate-400">Aspect Ratio</span>
              <select
                value={imgAspect}
                onChange={(e) => setImgAspect(e.target.value as '16:9' | '4:3' | '1:1')}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              >
                <option value="16:9">16:9 Widescreen</option>
                <option value="4:3">4:3 Technical</option>
                <option value="1:1">1:1 Square</option>
              </select>
            </label>
          </div>

          <button
            type="button"
            disabled={imgLoading || !imgPrompt.trim()}
            onClick={handleGenerateImage}
            className="w-full py-2 px-4 rounded-lg bg-sky-600 text-white text-xs font-medium hover:bg-sky-500 disabled:opacity-50 transition-colors"
          >
            {imgLoading ? `Generating ${imgSize} Hardware Render...` : `Generate ${imgSize} Hardware Visual`}
          </button>

          {generatedImg && (
            <div className="space-y-2">
              <img
                src={generatedImg.imageDataUrl}
                alt={imgPrompt}
                referrerPolicy="no-referrer"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800"
              />
              {generatedImg.caption && (
                <p className="text-xs text-slate-500 dark:text-slate-400">{generatedImg.caption}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
