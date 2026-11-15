import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { BoardSpec, CircuitDiagram, HardwareTelemetryState } from '../types/studio';

interface Board3DViewerProps {
  board: BoardSpec;
  circuit?: CircuitDiagram;
  telemetry?: HardwareTelemetryState;
}

export function Board3DViewer({ board, circuit, telemetry }: Board3DViewerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [viewPreset, setViewPreset] = useState<'iso' | 'top' | 'side'>('iso');
  const [explodeFactor, setExplodeFactor] = useState(0);
  const [hudCollapsed, setHudCollapsed] = useState(false);

  const presetRef = useRef(viewPreset);
  const explodeRef = useRef(explodeFactor);
  const ledActiveRef = useRef(false);
  const requestRenderRef = useRef<(() => void) | null>(null);
  const applyPresetRef = useRef<((preset: 'iso' | 'top' | 'side') => void) | null>(null);

  const builtInVal = telemetry?.gpioStates?.[board.builtInLedPin]?.value ?? 0;
  const isLedLit = builtInVal > 0;

  useEffect(() => {
    ledActiveRef.current = isLedLit;
    requestRenderRef.current?.();
  }, [isLedLit]);

  useEffect(() => {
    explodeRef.current = explodeFactor;
    requestRenderRef.current?.();
  }, [explodeFactor]);

  useEffect(() => {
    presetRef.current = viewPreset;
    applyPresetRef.current?.(viewPreset);
  }, [viewPreset]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || 720;
    const height = container.clientHeight || 420;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f17);
    scene.fog = new THREE.FogExp2(0x0b0f17, 0.032);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(5.2, 4.4, 5.8);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0.25, 0);
    controls.minDistance = 3.0;
    controls.maxDistance = 14.0;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;

    // Warm/cool studio lighting
    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.65);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.85);
    keyLight.position.set(5.5, 8.5, 4.5);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -5;
    keyLight.shadow.camera.right = 5;
    keyLight.shadow.camera.top = 5;
    keyLight.shadow.camera.bottom = -5;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.7);
    rimLight.position.set(-5, 3, -4);
    scene.add(rimLight);

    // Ground plane + subtle engineering grid + radial contact shadow
    const floorGeo = new THREE.PlaneGeometry(36, 36);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.9,
      metalness: 0.05,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = !isSoftwareGl;
    scene.add(floor);

    const grid = new THREE.GridHelper(20, 24, 0x1e293b, 0x151e2e);
    grid.position.y = 0.005;
    scene.add(grid);

    const contactGeo = new THREE.CircleGeometry(3.4, 32);
    const contactMat = new THREE.MeshBasicMaterial({
      color: 0x020617,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const contactShadow = new THREE.Mesh(contactGeo, contactMat);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.015;
    scene.add(contactShadow);

    // Composite 10-part MCU PCB Assembly Group
    const boardGroup = new THREE.Group();
    scene.add(boardGroup);

    const pcbColorHex = new THREE.Color(board.pcbColor || '#0f172a');
    const isC51 = board.id === 'stc8g1k08a';
    const isWide = board.id === 'uno' || board.id === 'mega' || board.id === 'due' || board.id === 'leonardo';
    const pcbLen = board.id === 'mega' || board.id === 'due' ? 4.4 : isWide ? 3.3 : isC51 ? 2.1 : 2.8;
    const pcbWid = isWide ? 2.4 : isC51 ? 1.25 : 1.35;

    // 1. Primary PCB Substrate (beveled ExtrudeGeometry)
    const pcbShape = new THREE.Shape();
    const hw = pcbLen / 2;
    const hh = pcbWid / 2;
    const r = 0.08;
    pcbShape.moveTo(-hw + r, -hh);
    pcbShape.lineTo(hw - r, -hh);
    pcbShape.quadraticCurveTo(hw, -hh, hw, -hh + r);
    pcbShape.lineTo(hw, hh - r);
    pcbShape.quadraticCurveTo(hw, hh, hw - r, hh);
    pcbShape.lineTo(-hw + r, hh);
    pcbShape.quadraticCurveTo(-hw, hh, -hw, hh - r);
    pcbShape.lineTo(-hw, -hh + r);
    pcbShape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

    const pcbGeo = new THREE.ExtrudeGeometry(pcbShape, {
      depth: 0.12,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.015,
      bevelSegments: 2,
    });
    pcbGeo.rotateX(-Math.PI / 2);
    const pcbMat = new THREE.MeshStandardMaterial({
      color: pcbColorHex,
      roughness: 0.55,
      metalness: 0.12,
    });
    const pcbMesh = new THREE.Mesh(pcbGeo, pcbMat);
    pcbMesh.position.y = 0.12;
    pcbMesh.castShadow = !isSoftwareGl;
    pcbMesh.receiveShadow = !isSoftwareGl;
    boardGroup.add(pcbMesh);

    // 2. USB Connector / RF Shield Housing
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.2,
      metalness: 0.9,
    });
    const usbGeo = new THREE.BoxGeometry(0.55, 0.28, 0.48);
    const usbMesh = new THREE.Mesh(usbGeo, metalMat);
    usbMesh.position.set(-hw + 0.18, 0.36, 0);
    usbMesh.castShadow = !isSoftwareGl;
    boardGroup.add(usbMesh);

    // 3. Main MCU Silicon IC or RF Module
    const mcuGroup = new THREE.Group();
    const icMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.35,
      metalness: 0.15,
    });
    const icGeo = isC51 ? new THREE.BoxGeometry(0.58, 0.14, 0.48) : new THREE.BoxGeometry(0.85, 0.14, 0.85);
    const icMesh = new THREE.Mesh(icGeo, icMat);
    icMesh.position.set(isC51 ? 0.15 : 0.2, 0.31, 0);
    icMesh.castShadow = !isSoftwareGl;
    mcuGroup.add(icMesh);

    if (board.wifi) {
      const shieldGeo = new THREE.BoxGeometry(0.95, 0.2, 0.88);
      const shieldMesh = new THREE.Mesh(shieldGeo, metalMat);
      shieldMesh.position.set(hw - 0.55, 0.34, 0);
      mcuGroup.add(shieldMesh);
    }
    boardGroup.add(mcuGroup);

    // 4. Instanced Gold Pin Headers (left & right rails)
    const pinCountPerSide = isC51 ? 4 : 14;
    const totalPins = pinCountPerSide * 2;
    const pinGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.24, 8);
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.2,
      metalness: 0.92,
    });
    const pinInstanced = new THREE.InstancedMesh(pinGeo, goldMat, totalPins);
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let side of [-1, 1]) {
      for (let i = 0; i < pinCountPerSide; i++) {
        const px = -hw + 0.45 + (i / (pinCountPerSide - 1)) * (pcbLen - 0.9);
        const pz = side * (hh - 0.16);
        dummy.position.set(px, 0.22, pz);
        dummy.updateMatrix();
        pinInstanced.setMatrixAt(idx++, dummy.matrix);
      }
    }
    pinInstanced.computeBoundingSphere();
    boardGroup.add(pinInstanced);

    // 5. Header plastic rails
    const railMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.78, metalness: 0.04 });
    const railGeo = new THREE.BoxGeometry(pcbLen - 0.7, 0.14, 0.14);
    for (let side of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(0, 0.29, side * (hh - 0.16));
      boardGroup.add(rail);
    }

    // 6. Voltage Regulator & Tactile Reset Button
    const regMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.22), icMat);
    regMesh.position.set(-hw + 0.65, 0.28, hh - 0.45);
    boardGroup.add(regMesh);

    const btnBase = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.22), metalMat);
    btnBase.position.set(-hw + 0.72, 0.28, -hh + 0.45);
    boardGroup.add(btnBase);

    const btnCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.08, 12),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4, metalness: 0.1 })
    );
    btnCap.position.set(-hw + 0.72, 0.34, -hh + 0.45);
    boardGroup.add(btnCap);

    // 7. Built-in Status LED (reacts dynamically to GPIO state!)
    const ledMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: new THREE.Color(0x0ea5e9),
      emissiveIntensity: ledActiveRef.current ? 2.6 : 0.15,
      roughness: 0.2,
      metalness: 0.1,
    });
    const ledMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.08), ledMat);
    ledMesh.position.set(0.25, 0.27, hh - 0.38);
    boardGroup.add(ledMesh);

    // 8. Attached external circuit peripherals (if diagram provided)
    const peripheralsGroup = new THREE.Group();
    scene.add(peripheralsGroup);
    const externalNodes = (circuit?.nodes ?? []).filter((n) => n.type !== 'board');
    externalNodes.slice(0, 5).forEach((node, i) => {
      const compGroup = new THREE.Group();
      const angle = ((i - (externalNodes.length - 1) / 2) * 0.42);
      const radius = 2.65;
      compGroup.position.set(Math.sin(angle) * radius, 0.16, Math.cos(angle) * radius * 0.72 + 1.15);

      const carrier = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.08, 0.52),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.65, metalness: 0.15 })
      );
      compGroup.add(carrier);

      if (node.type === 'led') {
        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(0.13, 14, 12),
          new THREE.MeshStandardMaterial({
            color: String(node.props.color || '#0ea5e9'),
            emissive: new THREE.Color(String(node.props.color || '#0ea5e9')),
            emissiveIntensity: ledActiveRef.current ? 2.2 : 0.2,
            roughness: 0.15,
          })
        );
        dome.position.y = 0.16;
        compGroup.add(dome);
      } else {
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(0.42, 0.24, 0.36),
          new THREE.MeshStandardMaterial({
            color: node.type === 'relay' ? 0x0284c7 : node.type === 'dht22' ? 0xe2e8f0 : 0x334155,
            roughness: 0.45,
            metalness: 0.2,
          })
        );
        body.position.y = 0.16;
        compGroup.add(body);
      }
      peripheralsGroup.add(compGroup);
    });

    // Render loop & on-demand coalescer
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;

    const targetCamPos = new THREE.Vector3(5.2, 4.4, 5.8);
    let camTransitionActive = false;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const requestRender = () => {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;

        // Apply exploded-view offset smoothly
        const exp = explodeRef.current;
        mcuGroup.position.y = exp * 0.75;
        usbMesh.position.y = 0.36 + exp * 0.35;
        pinInstanced.position.y = -exp * 0.25;
        ledMat.emissiveIntensity = ledActiveRef.current ? 2.6 : 0.15;

        if (camTransitionActive) {
          camera.position.lerp(targetCamPos, 0.22);
          if (camera.position.distanceTo(targetCamPos) < 0.05) {
            camera.position.copy(targetCamPos);
            camTransitionActive = false;
          } else {
            renderDirty = true;
          }
        }

        controls.update();
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (renderDirty && !disposed) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    };

    requestRenderRef.current = requestRender;
    applyPresetRef.current = (preset) => {
      if (preset === 'iso') targetCamPos.set(5.2, 4.4, 5.8);
      else if (preset === 'top') targetCamPos.set(0.01, 7.2, 0.01);
      else targetCamPos.set(6.4, 1.5, 0.01);
      camTransitionActive = true;
      requestRender();
    };

    controls.addEventListener('start', () => {
      camTransitionActive = false;
    });
    controls.addEventListener('change', requestRender);

    const handleResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth || 720;
      const h = container.clientHeight || 420;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      envTex.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [board.id, board.pcbColor, board.wifi, circuit?.nodes.length]);

  return (
    <div className="relative w-full h-[460px] rounded-lg border border-slate-200 dark:border-slate-800 bg-[#0B0F17] overflow-hidden">
      <div
        ref={mountRef}
        data-testid="three-canvas-container"
        className="w-full h-full"
        aria-label={`3D hardware model of ${board.name}`}
      />

      {/* Minimal Top-Left Spec Label (no pills or backdrop blur) */}
      <div className="absolute top-3 left-3 px-3 py-1.5 rounded border border-slate-700/80 bg-[#0F172A]/95 text-xs text-slate-200 pointer-events-none">
        <span className="font-semibold">{board.name}</span>
        <span className="mx-2 text-slate-500">·</span>
        <span className="font-mono text-sky-400">{board.mcu}</span>
        <span className="mx-2 text-slate-500">·</span>
        <span className="font-mono">
          {board.architecture === 'C51' ? 'P5.4' : `GPIO${board.builtInLedPin}`} {isLedLit ? 'HIGH' : 'LOW'}
        </span>
      </div>

      {/* Collapsible Bottom Control Dock (solid rgba, zero backdrop-blur) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center max-w-[94%]">
        <button
          type="button"
          onClick={() => setHudCollapsed((v) => !v)}
          className="px-3 py-1 text-[11px] font-medium text-slate-300 bg-[#111827] border border-b-0 border-slate-700 rounded-t-md hover:text-white transition-colors"
        >
          {hudCollapsed ? 'Show 3D Controls' : 'Hide 3D Controls'}
        </button>
        {!hudCollapsed && (
          <div className="flex flex-wrap items-center gap-4 px-4 py-2 rounded-lg border border-slate-700 bg-[#111827]/95 text-xs text-slate-200">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Camera:</span>
              {(['iso', 'top', 'side'] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setViewPreset(preset)}
                  className={`px-2.5 py-1 rounded text-xs font-medium capitalize transition-colors ${
                    viewPreset === preset
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2">
              <span className="text-slate-400 whitespace-nowrap">Explode Assembly:</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={explodeFactor}
                onChange={(e) => setExplodeFactor(Number(e.target.value))}
                className="w-24 accent-sky-500"
              />
              <span className="font-mono w-9 text-right tabular-nums">{Math.round(explodeFactor * 100)}%</span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
