import { GoogleGenAI, FunctionDeclaration, Type } from '@google/genai';
import { validateHardwareCommand } from '../src/logic/serialProtocol';
import type {
  ChatRolePreset,
  CircuitDiagram,
  GeneratedBlueprint,
  HardwareCommandProposal,
  LanguageCode,
} from '../src/types/studio';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const proposeHardwareCommandDecl: FunctionDeclaration = {
  name: 'proposeHardwareCommand',
  description:
    'Propose a validated microcontroller serial command for user authorization. NEVER executes automatically; requires user confirmation.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      command: {
        type: Type.STRING,
        description:
          'Protocol command string strictly matching allowlist: PIN:WRITE:<pin>:<0|1>, PIN:PWM:<pin>:<0-255>, SERVO:SET:<pin>:<0-180>, RELAY:SET:<channel>:<ON|OFF>, MOTOR:SPEED:<channel>:<0-255>, SENSOR:READ:<DHT22|BMP280|BME280|ADC|ALL>, or SYS:PING.',
      },
      targetBoardId: {
        type: Type.STRING,
        description: 'Target board ID such as esp32, uno, mega, pico, esp8266, stm32, or stc8g1k08a (STC8G1K08A C51).',
      },
      description: {
        type: Type.STRING,
        description: 'Clear human explanation of what this hardware command will do when authorized.',
      },
    },
    required: ['command', 'targetBoardId', 'description'],
  },
};

function buildSystemInstruction(rolePreset: ChatRolePreset, language: LanguageCode, boardId: string, activeCode?: string): string {
  const langRule =
    language === 'ms'
      ? 'Respond in clear technical Bahasa Melayu (with standard English electronics/Arduino terms preserved where helpful).'
      : 'Respond in clear, concise technical English.';

  const roleMap: Record<ChatRolePreset, string> = {
    architect:
      'You are a Senior Embedded Systems & Firmware Architect specializing in Arduino, ESP32, ESP8266, STM32, Raspberry Pi Pico (RP2040), and STC8G1K08A (1T 8051 / C51). Provide production-grade C/C++ firmware, non-blocking state machines, and safe electrical design guidance.',
    debugger:
      'You are an Electronics & Firmware Debugger. Identify root causes of compilation failures, memory overflows, brownouts, I2C pull-up issues, C51 SFR/port-mode misconfigurations (PxM0/PxM1), and logic-level mismatches (3.3V vs 5V).',
    commander:
      'You are a Hardware Control Assistant. When the user asks to control pins, LEDs, relays, servos, motors, or read sensors, ALWAYS generate the matching firmware snippet AND call the proposeHardwareCommand tool so the user can review and authorize the serial command safely.',
    tutor:
      'You are a Bilingual Electronics Engineering Mentor (English & Bahasa Melayu). Explain microcontroller concepts, Ohm’s Law, PWM, UART/I2C/SPI, 8051 C51 registers, and circuit safety clearly step-by-step.',
  };

  const c51Guidance =
    boardId === 'stc8g1k08a'
      ? '\nSTC8G1K08A C51 Rules: Generate standard C51/SDCC firmware (main.c with void main(void), #include <STC8G.h>, P3M0/P3M1/P5M0/P5M1 port mode setup, Timer1 UART1 on P3.0/P3.1, PCA PWM on P3.2/P3.3/P5.4). For proposeHardwareCommand pin indices on STC8G1K08A map P3.0->30, P3.1->31, P3.2->32, P3.3->33, P5.4->54, P5.5->55.'
      : '';

  return `${roleMap[rolePreset]}
${langRule}
Active target board ID: ${boardId}.${c51Guidance}
Safety Rules:
1. Never claim a hardware command was executed without user authorization. Use proposeHardwareCommand to propose allowlisted commands (PIN:WRITE:<pin>:<0|1>, PIN:PWM:<pin>:<0-255>, SERVO:SET:<pin>:<0-180>, RELAY:SET:<ch>:<ON|OFF>, MOTOR:SPEED:<ch>:<0-255>, SENSOR:READ:<type>).
2. Warn explicitly if 5V signals are connected to 3.3V-only boards (ESP32, ESP8266, RP2040, Arduino Due, STM32).
${activeCode ? `\nCurrent active editor code snippet:\n\`\`\`cpp\n${activeCode.slice(0, 3500)}\n\`\`\`` : ''}`;
}

export async function runChatTurn(params: {
  model: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  message: string;
  rolePreset: ChatRolePreset;
  language: LanguageCode;
  boardId: string;
  activeCode?: string;
  imageBase64?: string;
  imageMimeType?: string;
}): Promise<{ text: string; commandProposals: HardwareCommandProposal[]; usedModel: string }> {
  const ai = getAiClient();
  const allowedModels = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite', 'gemini-4-argon', 'gemini-4-carbon'];
  const model = allowedModels.includes(params.model) ? params.model : 'gemini-4-hydrogen';

  const contents: Array<{
    role: string;
    parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>;
  }> = params.history.slice(-14).map((h) => ({
    role: h.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: h.content }],
  }));

  const currentParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  if (params.imageBase64 && params.imageMimeType) {
    currentParts.push({
      inlineData: {
        mimeType: params.imageMimeType,
        data: params.imageBase64,
      },
    });
  }
  currentParts.push({ text: params.message });
  contents.push({ role: 'user', parts: currentParts });

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: buildSystemInstruction(params.rolePreset, params.language, params.boardId, params.activeCode),
      tools: [{ functionDeclarations: [proposeHardwareCommandDecl] }],
    },
  });

  const commandProposals: HardwareCommandProposal[] = [];
  if (response.functionCalls && response.functionCalls.length > 0) {
    for (const fc of response.functionCalls) {
      if (fc.name === 'proposeHardwareCommand' && fc.args) {
        const rawCmd = String(fc.args.command ?? '');
        const check = validateHardwareCommand(rawCmd);
        if (check.valid && check.actionType) {
          commandProposals.push({
            id: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            command: check.normalizedCommand,
            targetBoardId: String(fc.args.targetBoardId ?? params.boardId),
            description: String(fc.args.description ?? 'Execute allowlisted serial command'),
            pin: check.pin,
            actionType: check.actionType,
            requiresConfirmation: true,
            status: 'pending',
          });
        }
      }
    }
  }

  let text = response.text ?? '';
  if (!text && commandProposals.length > 0) {
    text =
      params.language === 'ms'
        ? `Saya telah menyediakan arahan perkakasan berikut untuk pengesahan anda sebelum dihantar ke papan ${params.boardId}:`
        : `I have prepared the following validated hardware command(s) for your explicit authorization before transmission to ${params.boardId}:`;
  }

  return { text, commandProposals, usedModel: model };
}

export async function analyzeVisionUpload(params: {
  base64Data: string;
  mimeType: string;
  prompt: string;
  boardId: string;
  language: LanguageCode;
}): Promise<{
  summary: string;
  identifiedComponents: string[];
  visuallyInferredConnections: string[];
  verifiedElectricalNotes: string[];
  wiringWarnings: string[];
  suggestedFirmware: string;
}> {
  const ai = getAiClient();
  const langNote = params.language === 'ms' ? 'Use Bahasa Melayu for descriptions.' : 'Use English for descriptions.';

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: params.mimeType,
            data: params.base64Data,
          },
        },
        {
          text: `Analyze this electronics circuit image/schematic/datasheet for target board "${params.boardId}".
${langNote}
User focus: ${params.prompt || 'Identify components, pinouts, inferred wiring, possible errors, and compatible Arduino firmware.'}
CRITICAL RULE: Explicitly separate visually inferred connections (from photo traces/wires that might be occluded or ambiguous) from verified electrical rules/requirements (datasheet pinouts, pull-ups, resistor requirements, voltage ratings).`,
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          identifiedComponents: { type: Type.ARRAY, items: { type: Type.STRING } },
          visuallyInferredConnections: { type: Type.ARRAY, items: { type: Type.STRING } },
          verifiedElectricalNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
          wiringWarnings: { type: Type.ARRAY, items: { type: Type.STRING } },
          suggestedFirmware: { type: Type.STRING },
        },
        required: [
          'summary',
          'identifiedComponents',
          'visuallyInferredConnections',
          'verifiedElectricalNotes',
          'wiringWarnings',
          'suggestedFirmware',
        ],
      },
    },
  });

  const raw = (response.text ?? '{}').trim();
  return JSON.parse(raw);
}

export async function generateProjectBlueprint(params: {
  prompt: string;
  boardId: string;
  language: LanguageCode;
}): Promise<GeneratedBlueprint> {
  const ai = getAiClient();
  const langNote = params.language === 'ms' ? 'Write explanations in Bahasa Melayu.' : 'Write explanations in English.';

  const c51ProjectNote =
    params.boardId === 'stc8g1k08a'
      ? 'Target is STC8G1K08A (8-pin 1T 8051 / C51): generate C51 firmware files (main.c with void main(void), #include <STC8G.h>, PxM0/PxM1 port modes, and STC-ISP / CH340G flashing instructions).'
      : 'Include complete, compilable Arduino C/C++ firmware files (.ino and optional .h), full component BOM, GPIO pin map, wiring steps, installation, compilation, testing, and troubleshooting.';

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Generate a complete embedded systems engineering project blueprint for board "${params.boardId}".
Project requirement: ${params.prompt}
${langNote}
${c51ProjectNote}`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          boardId: { type: Type.STRING },
          architecture: { type: Type.STRING },
          components: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                quantity: { type: Type.INTEGER },
                specs: { type: Type.STRING },
                purpose: { type: Type.STRING },
              },
              required: ['name', 'quantity', 'specs', 'purpose'],
            },
          },
          gpioAssignments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                pin: { type: Type.STRING },
                signal: { type: Type.STRING },
                component: { type: Type.STRING },
                notes: { type: Type.STRING },
              },
              required: ['pin', 'signal', 'component', 'notes'],
            },
          },
          wiringSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
          libraries: { type: Type.ARRAY, items: { type: Type.STRING } },
          files: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                language: { type: Type.STRING },
                content: { type: Type.STRING },
              },
              required: ['name', 'language', 'content'],
            },
          },
          installInstructions: { type: Type.ARRAY, items: { type: Type.STRING } },
          compileInstructions: { type: Type.ARRAY, items: { type: Type.STRING } },
          testingProcedures: { type: Type.ARRAY, items: { type: Type.STRING } },
          troubleshootingGuide: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: [
          'title',
          'boardId',
          'architecture',
          'components',
          'gpioAssignments',
          'wiringSteps',
          'libraries',
          'files',
          'installInstructions',
          'compileInstructions',
          'testingProcedures',
          'troubleshootingGuide',
        ],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as GeneratedBlueprint;
  return parsed;
}

export async function analyzeCircuitWithAI(diagram: CircuitDiagram, boardId: string, language: LanguageCode): Promise<string> {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Review this virtual circuit graph for board "${boardId}" and provide concise wiring recommendations, safety checks (voltage levels, pull-up/current-limiting resistors), and pin optimization advice (${language === 'ms' ? 'in Bahasa Melayu' : 'in English'}):
${JSON.stringify(diagram)}`,
  });
  return response.text ?? 'No circuit analysis generated.';
}

export async function generateHardwareVisual(params: {
  prompt: string;
  imageSize: '1K' | '2K' | '4K';
  aspectRatio?: '1:1' | '16:9' | '4:3' | '3:4';
}): Promise<{ imageDataUrl: string; caption: string }> {
  const ai = getAiClient();
  const size = ['1K', '2K', '4K'].includes(params.imageSize) ? params.imageSize : '1K';
  const aspectRatio = params.aspectRatio ?? '16:9';

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: {
      parts: [
        {
          text: `Technical hardware engineering visual: ${params.prompt}. Clean industrial engineering aesthetic, high-precision electronics workbench or isometric PCB/schematic render.`,
        },
      ],
    },
    config: {
      imageConfig: {
        aspectRatio,
        imageSize: size,
      },
    },
  });

  let imageDataUrl = '';
  let caption = '';
  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) {
      const mime = part.inlineData.mimeType ?? 'image/png';
      imageDataUrl = `data:${mime};base64,${part.inlineData.data}`;
    } else if (part.text) {
      caption += part.text;
    }
  }

  if (!imageDataUrl) {
    throw new Error('No image was returned by gemini-3-pro-image-preview.');
  }

  return { imageDataUrl, caption };
}
