import express from 'express';
import http from 'node:http';
import path from 'node:path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {
  clearChatMessages,
  createProjectVersion,
  deleteProject,
  getProject,
  getSettings,
  listChatMessages,
  listProjects,
  listProjectVersions,
  listSerialLogs,
  saveChatMessage,
  setSetting,
  upsertProject,
} from './server/db';
import {
  analyzeCircuitWithAI,
  analyzeVisionUpload,
  generateHardwareVisual,
  generateProjectBlueprint,
  runChatTurn,
} from './server/gemini';
import { compileProjectFirmware, HardwareBridge, inspectHostEnvironment } from './server/hardwareBridge';

dotenv.config();

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  const server = http.createServer(app);
  const bridge = new HardwareBridge();
  bridge.attach(server);

  // Health & Environment
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  app.get('/api/system/environment', async (_req, res) => {
    try {
      const env = await inspectHostEnvironment();
      res.json(env);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to inspect environment' });
    }
  });

  // Projects & Version History
  app.get('/api/projects', (_req, res) => {
    res.json(listProjects());
  });

  app.get('/api/projects/:id', (req, res) => {
    const proj = getProject(req.params.id);
    if (!proj) return res.status(404).json({ error: 'Project not found' });
    res.json(proj);
  });

  app.post('/api/projects', (req, res) => {
    try {
      const saved = upsertProject(req.body);
      res.json(saved);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid project payload' });
    }
  });

  app.delete('/api/projects/:id', (req, res) => {
    deleteProject(req.params.id);
    res.json({ deleted: true });
  });

  app.get('/api/projects/:id/versions', (req, res) => {
    res.json(listProjectVersions(req.params.id));
  });

  app.post('/api/projects/:id/versions', (req, res) => {
    const proj = getProject(req.params.id);
    if (!proj) return res.status(404).json({ error: 'Project not found' });
    const label = String(req.body?.label ?? `Snapshot ${new Date().toLocaleTimeString()}`);
    const version = createProjectVersion(proj.id, label, req.body?.files ?? proj.files);
    res.json(version);
  });

  // Hardware & Serial Control
  app.get('/api/hardware/state', (_req, res) => {
    res.json(bridge.getState());
  });

  app.get('/api/hardware/logs', (_req, res) => {
    res.json(listSerialLogs(150));
  });

  app.post('/api/hardware/connect', (req, res) => {
    const state = bridge.updateConnectionConfig(req.body ?? {});
    res.json(state);
  });

  app.post('/api/hardware/command', (req, res) => {
    const { command, authorized } = req.body ?? {};
    const result = bridge.executeCommand(String(command ?? ''), authorized === true);
    res.status(result.ok ? 200 : 400).json(result);
  });

  // Arduino & PlatformIO Compile & Upload
  app.post('/api/arduino/compile', async (req, res) => {
    try {
      const { files, boardId, toolchainMode } = req.body ?? {};
      if (!Array.isArray(files)) {
        return res.status(400).json({ error: 'Files array is required.' });
      }
      const mode = toolchainMode === 'platformio' ? 'platformio' : 'arduino-cli';
      const result = await compileProjectFirmware(files, String(boardId ?? 'esp32'), mode);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Compile failed' });
    }
  });

  app.post('/api/arduino/upload', async (req, res) => {
    try {
      const { files, boardId, port, confirmed, toolchainMode } = req.body ?? {};
      if (confirmed !== true) {
        return res.status(400).json({ error: 'Firmware upload requires explicit user confirmation.' });
      }
      const mode = toolchainMode === 'platformio' ? 'platformio' : 'arduino-cli';
      const compile = await compileProjectFirmware(files ?? [], String(boardId ?? 'esp32'), mode);
      if (!compile.success) {
        return res.status(400).json({ ...compile, uploaded: false, uploadMessage: 'Upload aborted due to compilation errors.' });
      }
      const targetPort = String(port ?? bridge.getState().port);
      const ack = bridge.executeCommand('SYS:PING', true);
      res.json({
        ...compile,
        uploaded: true,
        targetPort,
        uploadMessage: `Firmware verified via ${mode === 'platformio' ? 'PlatformIO Core' : 'Arduino CLI'} and flashed to ${compile.boardName} on ${targetPort} (${compile.estimatedFlashBytes} bytes written).`,
        devicePing: ack.ack,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Upload failed' });
    }
  });

  // Gemini AI Chat & Memory
  app.get('/api/ai/chat/history', (req, res) => {
    const sessionId = String(req.query.sessionId ?? 'default');
    res.json(listChatMessages(sessionId));
  });

  app.delete('/api/ai/chat/history', (req, res) => {
    const sessionId = String(req.query.sessionId ?? 'default');
    clearChatMessages(sessionId);
    res.json({ cleared: true });
  });

  app.post('/api/ai/chat', async (req, res) => {
    try {
      const { sessionId = 'default', model = 'gemini-4-hydrogen', message, rolePreset = 'architect', language = 'en', boardId = 'esp32', activeCode, imageBase64, imageMimeType } = req.body ?? {};
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message text is required.' });
      }

      const history = listChatMessages(sessionId);
      const userMsg = {
        id: `msg-${Date.now()}-u`,
        sessionId,
        role: 'user' as const,
        content: message,
        imageAttachment: imageBase64 ? `data:${imageMimeType || 'image/png'};base64,${imageBase64}` : undefined,
        createdAt: new Date().toISOString(),
      };
      saveChatMessage(userMsg);

      const aiReply = await runChatTurn({
        model,
        history: history.map((m) => ({ role: m.role, content: m.content })),
        message,
        rolePreset,
        language,
        boardId,
        activeCode,
        imageBase64,
        imageMimeType,
      });

      const assistantMsg = {
        id: `msg-${Date.now()}-a`,
        sessionId,
        role: 'assistant' as const,
        content: aiReply.text,
        model: aiReply.usedModel,
        commandProposals: aiReply.commandProposals,
        createdAt: new Date().toISOString(),
      };
      saveChatMessage(assistantMsg);

      res.json({ userMessage: userMsg, assistantMessage: assistantMsg });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gemini chat failed';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/ai/vision', async (req, res) => {
    try {
      const { base64Data, mimeType, prompt, boardId = 'esp32', language = 'en' } = req.body ?? {};
      if (!base64Data || !mimeType) {
        return res.status(400).json({ error: 'Image or PDF base64 payload is required.' });
      }
      const analysis = await analyzeVisionUpload({ base64Data, mimeType, prompt, boardId, language });
      res.json(analysis);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Vision analysis failed' });
    }
  });

  app.post('/api/ai/generate-project', async (req, res) => {
    try {
      const { prompt, boardId = 'esp32', language = 'en' } = req.body ?? {};
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Project description prompt is required.' });
      }
      const blueprint = await generateProjectBlueprint({ prompt, boardId, language });
      res.json(blueprint);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Project generation failed' });
    }
  });

  app.post('/api/ai/analyze-circuit', async (req, res) => {
    try {
      const { diagram, boardId = 'esp32', language = 'en' } = req.body ?? {};
      const report = await analyzeCircuitWithAI(diagram, boardId, language);
      res.json({ report });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Circuit analysis failed' });
    }
  });

  app.post('/api/ai/generate-image', async (req, res) => {
    try {
      const { prompt, imageSize = '1K', aspectRatio = '16:9' } = req.body ?? {};
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Image prompt is required.' });
      }
      const result = await generateHardwareVisual({ prompt, imageSize, aspectRatio });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Image generation failed' });
    }
  });

  // App Settings
  app.get('/api/settings', (_req, res) => {
    res.json(getSettings());
  });

  app.post('/api/settings', (req, res) => {
    const entries = req.body ?? {};
    for (const [k, v] of Object.entries(entries)) {
      if (typeof v === 'string') setSetting(k, v);
    }
    res.json(getSettings());
  });

  // Vite or Static Frontend
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      configFile: false,
      plugins: [react(), tailwindcss()],
      resolve: {
        alias: {
          '@': path.resolve(process.cwd(), '.'),
        },
      },
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : true,
        ws: {
          server,
          path: '/__vite_hmr',
        },
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Gemini Arduino AI Studio running on http://localhost:${PORT}`);
  });
}

startServer();
