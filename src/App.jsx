import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';

// --- 样式注入 ---
const Styles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&family=Luxurious+Script&display=swap');
    body, html { margin: 0; padding: 0; width: 100%; height: 100%; background: #020408; overflow: hidden; }
    .lux-font { font-family: 'Luxurious Script', cursive; }
    .inter-font { font-family: 'Inter', sans-serif; }
    
    .ui-container { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 10; }
    
    /* 修改点：Main Title 现在是独立的绝对定位元素 
       增加了 transition 用于处理移动和淡入淡出
    */
    .main-title { 
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      font-size: 5rem; 
      color: #dffadd; 
      text-shadow: 0 0 30px rgba(223,250,221,0.6); 
      margin: 0; 
      line-height: 1.1; 
      text-align: center;
      white-space: nowrap;
      z-index: 60; /* 确保在最上层 */
      transition: all 1s ease-in-out; /* 平滑移动动画 */
    }

    /* Start Screen 现在只包含按钮和副标题 */
    .start-screen-content {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.9);
      transition: opacity 1s ease;
      pointer-events: auto;
      z-index: 50;
    }
    
    .sub-title { 
      font-size: 1.5rem; color: #94a3b8; letter-spacing: 0.2em; margin-top: 120px; text-align: center; /* margin-top 增加以避开标题 */
    }

    .enter-btn {
      margin-top: 50px; padding: 15px 50px; font-size: 1.5rem;
      color: #050b14; background: #dffadd; border: none; border-radius: 30px;
      cursor: pointer; box-shadow: 0 0 20px rgba(223,250,221,0.4);
      transition: all 0.3s ease; font-family: 'Inter', sans-serif; font-weight: 600; letter-spacing: 2px;
    }
    .enter-btn:hover { background: #ffffff; transform: scale(1.05); box-shadow: 0 0 40px rgba(255,255,255,0.8); }
    
    .bulb-hitbox {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 250px; height: 250px; 
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      pointer-events: auto; 
      cursor: pointer;
      z-index: 40;
    }
    
    .bulb-content {
      display: flex; flex-direction: column; align-items: center; gap: 10px;
      transition: opacity 0.3s ease;
    }

    .bulb-icon { width: 60px; height: 60px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.3); display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.1); transition: all 0.5s; }
    .bulb-icon:hover { background: rgba(255,255,255,0.2); transform: scale(1.1); }
    .bulb-icon.on { background: rgba(255, 215, 0, 0.2); box-shadow: 0 0 40px rgba(255, 215, 0, 0.6); border-color: rgba(255, 215, 0, 1); }
    
    .camera-box { position: absolute; bottom: 30px; right: 30px; width: 120px; height: 90px; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; overflow: hidden; pointer-events: auto; }
    
    .morph-btn {
      position: absolute; bottom: 30px; left: 30px;
      padding: 12px 25px;
      background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3);
      color: white; font-family: 'Inter', sans-serif; cursor: pointer;
      font-size: 14px; letter-spacing: 1px;
      border-radius: 20px; pointer-events: auto; transition: 0.3s;
    }
    .morph-btn:hover { background: rgba(255,255,255,0.3); transform: scale(1.05); }
    
    .gesture-hint {
        position: absolute; top: 20px; right: 20px; text-align: right;
        font-family: 'Inter', sans-serif; font-size: 12px; color: rgba(255,255,255,0.5);
    }

    /* 颜色选择器样式 */
    .color-picker {
      position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%);
      display: flex; gap: 15px; padding: 10px 20px;
      background: rgba(0,0,0,0.6); border-radius: 30px;
      pointer-events: auto; z-index: 50;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .color-dot {
      width: 24px; height: 24px; border-radius: 50%; cursor: pointer;
      border: 2px solid transparent; transition: all 0.3s;
      position: relative;
    }
    .color-dot:hover { transform: scale(1.2); }
    .color-dot.active { border-color: white; transform: scale(1.1); box-shadow: 0 0 10px rgba(255,255,255,0.5); }
  `}</style>
);

// --- 颜色配置 ---
const TREE_COLORS = [
  { name: 'Green', hex: '#80ffaa' },
  { name: 'Silver', hex: '#e0e6ed' },
  { name: 'Gold', hex: '#ffcc00' },
  { name: 'Blue', hex: '#88ccff' },
  { name: 'Purple', hex: '#cc88ff' },
];

// --- MEDIAPIPE HOOK ---
const useMediaPipe = (videoRef, canvasRef, onGesture) => {
  useEffect(() => {
    if (!videoRef.current || !canvasRef.current) return;
    let hands;
    let camera;

    const loadScripts = async () => {
      const urls = [
        'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js',
        'https://cdn.jsdelivr.net/npm/@mediapipe/control_utils/control_utils.js',
        'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js',
        'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js',
      ];
      await Promise.all(
        urls.map(
          (src) =>
            new Promise((resolve) => {
              if (document.querySelector(`script[src="${src}"]`)) {
                resolve();
                return;
              }
              const s = document.createElement('script');
              s.src = src;
              s.onload = resolve;
              document.body.appendChild(s);
            })
        )
      );

      if (window.Hands) {
        hands = new window.Hands({
          locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.3,
          minTrackingConfidence: 0.3,
        });

        hands.onResults((results) => {
          if (!canvasRef.current) return;
          const ctx = canvasRef.current.getContext('2d');
          ctx.save();
          ctx.clearRect(
            0,
            0,
            canvasRef.current.width,
            canvasRef.current.height
          );
          ctx.translate(canvasRef.current.width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(
            results.image,
            0,
            0,
            canvasRef.current.width,
            canvasRef.current.height
          );

          if (
            results.multiHandLandmarks &&
            results.multiHandLandmarks.length > 0
          ) {
            const lm = results.multiHandLandmarks[0];
            if (window.drawConnectors)
              window.drawConnectors(ctx, lm, window.HAND_CONNECTIONS, {
                color: '#00FF00',
                lineWidth: 1,
              });

            const thumb = lm[4];
            const index = lm[8];
            const dist = Math.hypot(thumb.x - index.x, thumb.y - index.y);

            const isPinch = dist < 0.08 || index.y > lm[5].y;
            const isOpen = !isPinch && dist > 0.12;

            let type = 'IDLE';
            if (isPinch) type = 'PINCH';
            if (isOpen) type = 'OPEN';

            onGesture({ type, x: 1 - index.x, y: index.y });
          }
          ctx.restore();
        });

        if (window.Camera) {
          camera = new window.Camera(videoRef.current, {
            onFrame: async () => {
              if (videoRef.current && videoRef.current.readyState >= 2)
                await hands.send({ image: videoRef.current });
            },
            width: 320,
            height: 240,
          });
          camera.start();
        }
      }
    };
    loadScripts();
  }, []);
};

// --- 背景粒子 ---
const FallingSnow = () => {
  const count = 2500;
  const meshRef = useRef(null);
  const [positions, speeds] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const spd = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 60;
      pos[i * 3 + 1] = Math.random() * 50 - 20;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 60;
      spd[i] = Math.random() * 0.05 + 0.02;
    }
    return [pos, spd];
  }, []);
  useFrame(() => {
    if (!meshRef.current) return;
    const positions = meshRef.current.geometry.attributes.position.array;
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 1] -= speeds[i];
      if (positions[i * 3 + 1] < -10) {
        positions[i * 3 + 1] = 30;
        positions[i * 3] = (Math.random() - 0.5) * 60;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
      }
    }
    meshRef.current.geometry.attributes.position.needsUpdate = true;
    meshRef.current.rotation.y += 0.001;
  });
  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.06}
        color="#ffffff"
        transparent
        opacity={0.7}
        depthWrite={false}
      />
    </points>
  );
};

const ParticleFloor = () => {
  const count = 15000;
  const points = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 80;
      const z = (Math.random() - 0.5) * 80;
      const y = -7.5 + Math.sin(x * 0.1) * Math.cos(z * 0.1) * 1.5;
      arr[i * 3] = x;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = z;
    }
    return arr;
  }, []);
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={points}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.08}
        color="#8899aa"
        transparent
        opacity={0.4}
        sizeAttenuation={true}
        depthWrite={false}
      />
    </points>
  );
};

const ParticleStar = ({ powerOn }) => {
  const count = 2000;
  const meshRef = useRef(null);
  const points = useMemo(() => {
    const arr = new Float32Array(count * 3);
    const outerRadius = 1.3;
    const innerRadius = 0.5;
    const depth = 0.5;
    const vertices = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outerRadius : innerRadius;
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      vertices.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    for (let i = 0; i < count; i++) {
      const sector = Math.floor(Math.random() * 10);
      const p1 = { x: 0, y: 0 };
      const p2 = vertices[sector];
      const p3 = vertices[(sector + 1) % 10];
      let r1 = Math.random();
      let r2 = Math.random();
      if (r1 + r2 > 1) {
        r1 = 1 - r1;
        r2 = 1 - r2;
      }
      const a = 1 - r1 - r2;
      const x = a * p1.x + r1 * p2.x + r2 * p3.x;
      const y = a * p1.y + r1 * p2.y + r2 * p3.y;
      arr[i * 3] = x;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = (Math.random() - 0.5) * depth;
    }
    return arr;
  }, []);
  useFrame((state, delta) => {
    if (meshRef.current && powerOn) meshRef.current.rotation.y += delta * 0.2;
  });
  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={points}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.06}
        color="#ffffff"
        transparent
        opacity={powerOn ? 1.0 : 0.1}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
};

const SpiralRibbon = ({ powerOn }) => {
  const count = 3000;
  const meshRef = useRef(null);
  const points = useMemo(() => {
    const arr = new Float32Array(count * 3);
    const height = 37;
    const loops = 7;
    const maxRadius = 16;
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const y = 8 - t * height;
      const radius = t * maxRadius + 0.5;
      const angle = t * Math.PI * 2 * loops;
      arr[i * 3] = Math.cos(angle) * radius + (Math.random() - 0.5) * 1.3;
      arr[i * 3 + 1] = y + (Math.random() - 0.5) * 1.3;
      arr[i * 3 + 2] = Math.sin(angle) * radius + (Math.random() - 0.5) * 1.3;
    }
    return arr;
  }, []);
  useFrame((state, delta) => {
    if (meshRef.current && powerOn) meshRef.current.rotation.y -= delta * 0.5;
  });
  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={points}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.25}
        color="#ffffff"
        transparent
        opacity={powerOn ? 0.9 : 0.05}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
};

// --- 文字生成 ---
const createTextPoints = (text, width = 40, height = 20) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const w = 2048;
  const h = 1024;
  canvas.width = w;
  canvas.height = h;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);
  ctx.font = '400 180px "Luxurious Script", cursive';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 15;
  const lines = text.split('\n');
  const lineHeight = 200;
  const startY = h / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => {
    const y = startY + i * lineHeight;
    ctx.strokeText(line, w / 2, y);
    ctx.fillText(line, w / 2, y);
  });
  const imgData = ctx.getImageData(0, 0, w, h).data;
  const coords = [];
  const gap = 4;
  for (let y = 0; y < h; y += gap) {
    for (let x = 0; x < w; x += gap) {
      if (imgData[(y * w + x) * 4] > 64) {
        coords.push((x / w - 0.5) * width, -(y / h - 0.5) * height, 0);
      }
    }
  }
  return new Float32Array(coords);
};

// --- 工具：生成特定颜色的树粒子颜色 ---
const generateTreeColors = (count, hexColor) => {
  const col = new Float32Array(count * 3);
  const uniformColor = new THREE.Color(hexColor);
  for (let i = 0; i < count; i++) {
    const base = uniformColor.clone();
    // 增加一点随机扰动，让树更有质感
    base.r += (Math.random() - 0.5) * 0.15;
    base.g += (Math.random() - 0.5) * 0.15;
    base.b += (Math.random() - 0.5) * 0.15;
    col[i * 3] = base.r;
    col[i * 3 + 1] = base.g;
    col[i * 3 + 2] = base.b;
  }
  return col;
};

// --- 可变形粒子树/文字 ---
const MorphParticleTree = ({
  powerOn,
  gestureState,
  recipient,
  targetMode,
  treeColor,
}) => {
  const count = 15000;
  const meshRef = useRef(null);

  // 1. 初始化树的结构 (位置)
  const initialData = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = generateTreeColors(count, treeColor); // 初始颜色
    for (let i = 0; i < count; i++) {
      const h = Math.cbrt(Math.random());
      const y = 8 - h * 40;
      const r = h * 15 * Math.sqrt(Math.random());
      const a = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    return { pos, col };
  }, []); // 只运行一次

  const pointsRef = useRef(initialData.pos.slice(0));
  const colorsRef = useRef(initialData.col.slice(0));

  const targetPositions = useRef(initialData.pos.slice(0));
  const targetColors = useRef(initialData.col.slice(0));

  const textPoints = useMemo(() => {
    const text = `Merry Christmas\nand Happy New Year\nDear ${recipient}`;
    return createTextPoints(text);
  }, [recipient]);

  const animationPhase = useRef(0);

  // 监听 treeColor 变化，实时更新目标颜色
  useEffect(() => {
    if (targetMode === 'TREE') {
      const newColors = generateTreeColors(count, treeColor);
      for (let i = 0; i < count; i++) {
        targetColors.current[i * 3] = newColors[i * 3];
        targetColors.current[i * 3 + 1] = newColors[i * 3 + 1];
        targetColors.current[i * 3 + 2] = newColors[i * 3 + 2];
      }
    }
  }, [treeColor, targetMode]);

  useEffect(() => {
    animationPhase.current = 1;

    // 设置目标颜色
    if (targetMode === 'TEXT') {
      for (let i = 0; i < count; i++) {
        targetColors.current[i * 3] = 4.0;
        targetColors.current[i * 3 + 1] = 4.0;
        targetColors.current[i * 3 + 2] = 4.0;
      }
    } else {
      const newColors = generateTreeColors(count, treeColor);
      for (let i = 0; i < count; i++) {
        targetColors.current[i * 3] = newColors[i * 3];
        targetColors.current[i * 3 + 1] = newColors[i * 3 + 1];
        targetColors.current[i * 3 + 2] = newColors[i * 3 + 2];
      }
    }

    // 设置爆炸轨迹
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = 30 + Math.random() * 30;
      targetPositions.current[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      targetPositions.current[i * 3 + 1] =
        Math.sin(phi) * Math.sin(theta) * r;
      targetPositions.current[i * 3 + 2] = Math.cos(phi) * r;
    }

    const t = setTimeout(() => {
      animationPhase.current = 2; // Assemble
      if (targetMode === 'TEXT') {
        const len = textPoints.length / 3;
        for (let i = 0; i < count; i++) {
          if (i < len) {
            targetPositions.current[i * 3] = textPoints[i * 3];
            targetPositions.current[i * 3 + 1] = textPoints[i * 3 + 1];
            targetPositions.current[i * 3 + 2] = textPoints[i * 3 + 2];
          } else {
            targetPositions.current[i * 3] = 0;
            targetPositions.current[i * 3 + 1] = -200;
            targetPositions.current[i * 3 + 2] = 0;
          }
        }
      } else {
        // Back to tree
        for (let i = 0; i < count; i++) {
          targetPositions.current[i * 3] = initialData.pos[i * 3];
          targetPositions.current[i * 3 + 1] = initialData.pos[i * 3 + 1];
          targetPositions.current[i * 3 + 2] = initialData.pos[i * 3 + 2];
        }
      }
    }, 800);
    return () => clearTimeout(t);
  }, [targetMode, textPoints, initialData, treeColor]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    if (targetMode === 'TREE' && powerOn) {
      meshRef.current.rotation.y += 0.3 * delta;
    } else if (targetMode === 'TEXT') {
      meshRef.current.rotation.y = THREE.MathUtils.lerp(
        meshRef.current.rotation.y,
        0,
        delta * 2
      );
    }

    const positions = meshRef.current.geometry.attributes.position.array;
    const colors = meshRef.current.geometry.attributes.color.array;

    const lerpFactor = animationPhase.current === 1 ? 2.0 * delta : 3.0 * delta;

    for (let i = 0; i < count; i++) {
      positions[i * 3] +=
        (targetPositions.current[i * 3] - positions[i * 3]) * lerpFactor;
      positions[i * 3 + 1] +=
        (targetPositions.current[i * 3 + 1] - positions[i * 3 + 1]) *
        lerpFactor;
      positions[i * 3 + 2] +=
        (targetPositions.current[i * 3 + 2] - positions[i * 3 + 2]) *
        lerpFactor;

      colors[i * 3] +=
        (targetColors.current[i * 3] - colors[i * 3]) * lerpFactor;
      colors[i * 3 + 1] +=
        (targetColors.current[i * 3 + 1] - colors[i * 3 + 1]) * lerpFactor;
      colors[i * 3 + 2] +=
        (targetColors.current[i * 3 + 2] - colors[i * 3 + 2]) * lerpFactor;
    }

    meshRef.current.geometry.attributes.position.needsUpdate = true;
    meshRef.current.geometry.attributes.color.needsUpdate = true;

    const baseScale = targetMode === 'TEXT' ? 1.2 : 1.0;
    const s =
      baseScale * (0.98 + Math.sin(state.clock.elapsedTime * 0.8) * 0.01);
    meshRef.current.scale.lerp(new THREE.Vector3(s, s, s), 0.1);
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={pointsRef.current}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={count}
          array={colorsRef.current}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.12}
        vertexColors
        transparent
        opacity={powerOn ? 0.9 : 0.4}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
};

// --- 场景组件 ---
const Scene = ({ powerOn, recipient, morphMode, treeColor }) => {
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 2, 24]} fov={55} />
      <OrbitControls
        enableZoom={false}
        autoRotate={powerOn && morphMode === 'TREE'}
        autoRotateSpeed={0.5}
        minPolarAngle={Math.PI / 3}
        maxPolarAngle={Math.PI / 1.8}
      />
      <ambientLight intensity={0.5} color="#b0d0ff" />
      <group position={[0, -9, -85]} scale={[1, 1, 1]}>
        <MorphParticleTree
          powerOn={powerOn}
          recipient={recipient}
          targetMode={morphMode}
          treeColor={treeColor}
        />
        <group visible={morphMode === 'TREE'}>
          <SpiralRibbon powerOn={powerOn} />
          <group position={[0, 8.5, 0]}>
            <ParticleStar powerOn={powerOn} />
          </group>
        </group>
      </group>
      <FallingSnow />
      <ParticleFloor />
      <EffectComposer disableNormalPass>
        <Bloom
          luminanceThreshold={0.8}
          luminanceSmoothing={0.5}
          mipmapBlur
          intensity={1.5}
          radius={0.3}
        />
        <Vignette eskil={false} offset={0.1} darkness={1.2} />
      </EffectComposer>
    </>
  );
};

// --- 主 APP ---
export default function App() {
  const [started, setStarted] = useState(false);
  const [powerOn, setPowerOn] = useState(false);
  const [morphMode, setMorphMode] = useState('TREE');
  const [gestureState, setGestureState] = useState({
    type: 'IDLE',
    x: 0,
    y: 0,
  });
  const [isHoveringBulb, setIsHoveringBulb] = useState(false);
  const [recipient, setRecipient] = useState('Friend');
  const [treeColor, setTreeColor] = useState(TREE_COLORS[0].hex);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const lastY = useRef(0);
  const prevGestureType = useRef('IDLE');
  const lastModeChangeTime = useRef(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const name = params.get('name');
    if (name) setRecipient(name);
  }, []);

  const handleGesture = (data) => {
    setGestureState(data);
    const { type, y } = data;
    const prev = prevGestureType.current;
    const now = Date.now();

    if (type === 'PINCH') {
      if (y - lastY.current > 0.03) {
        if (now - lastModeChangeTime.current > 500) {
          setPowerOn((prevPower) => !prevPower);
          lastModeChangeTime.current = now;
        }
        lastY.current = y;
      }
    }

    if (now - lastModeChangeTime.current > 1500) {
      if (prev === 'PINCH' && type === 'OPEN' && morphMode === 'TREE') {
        setMorphMode('TEXT');
        lastModeChangeTime.current = now;
      }
      if (type === 'PINCH' && morphMode === 'TEXT') {
        setMorphMode('TREE');
        lastModeChangeTime.current = now;
      }
    }

    lastY.current = y;
    prevGestureType.current = type;
  };

  useMediaPipe(videoRef, canvasRef, handleGesture);

  return (
    <>
      <Styles />
      <div className="ui-container">
        {/* Main Title: 独立于 Start Screen 的绝对定位元素
            started 为 false 时居中
            started 为 true 且是 Tree 模式时，移到顶部
            TEXT 模式时隐藏
        */}
        <h1
          className="main-title lux-font"
          style={{
            top: started ? '10%' : '40%', // Enter 后上移
            transform: started ? 'translate(-50%, 0)' : 'translate(-50%, -50%)',
            opacity: started && morphMode === 'TEXT' ? 0 : 1, // 祝福语界面隐藏
          }}
        >
          Merry Christmas
        </h1>

        <div
          className="start-screen-content"
          style={{
            opacity: started ? 0 : 1,
            pointerEvents: started ? 'none' : 'auto',
          }}
        >
          {/* 这里只保留副标题和按钮，主标题移出去了 */}
          <p className="sub-title inter-font">TO: {recipient}</p>
          <button className="enter-btn" onClick={() => setStarted(true)}>
            ENTER
          </button>
        </div>

        <div
          className="bulb-hitbox"
          onClick={() => setPowerOn((prev) => !prev)}
          onMouseEnter={() => setIsHoveringBulb(true)}
          onMouseLeave={() => setIsHoveringBulb(false)}
          style={{ pointerEvents: started ? 'auto' : 'none' }}
        >
          <div
            className="bulb-content"
            style={{
              opacity:
                started && morphMode === 'TREE' && isHoveringBulb ? 1 : 0,
            }}
          >
            <div
              className="inter-font"
              style={{ fontSize: '10px', color: '#aaa', letterSpacing: '2px' }}
            >
              PINCH & PULL (OR CLICK)
            </div>
            <div className={`bulb-icon ${powerOn ? 'on' : ''}`}>
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke={powerOn ? '#fff' : '#fff'}
                strokeWidth="2"
              >
                <path d="M9 18h6M10 22h4M12 2v4M12 6a5 5 0 015 5c0 2.5-1.5 4-3 6H10c-1.5-2-3-3.5-3-6a5 5 0 015-5z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="color-picker" style={{ opacity: started ? 1 : 0 }}>
          {TREE_COLORS.map((c) => (
            <div
              key={c.name}
              className={`color-dot ${treeColor === c.hex ? 'active' : ''}`}
              style={{ backgroundColor: c.hex }}
              onClick={() => setTreeColor(c.hex)}
              title={c.name}
            />
          ))}
        </div>

        <button
          className="morph-btn"
          style={{ opacity: started ? 1 : 0 }}
          onClick={() =>
            setMorphMode((prev) => (prev === 'TREE' ? 'TEXT' : 'TREE'))
          }
        >
          {morphMode === 'TREE' ? 'SHOW WISHES' : 'BACK TO TREE'}
        </button>

        <div
          className="camera-box"
          style={{ opacity: started ? 1 : 0, transition: 'opacity 1s' }}
        >
          <video
            ref={videoRef}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.6,
            }}
            autoPlay
            playsInline
            muted
          />
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
            }}
            width={320}
            height={240}
          />
        </div>
      </div>

      <Canvas
        camera={{ position: [0, 0, 10] }}
        gl={{ antialias: false, toneMapping: THREE.ReinhardToneMapping }}
      >
        <Suspense fallback={null}>
          {started && (
            <Scene
              powerOn={powerOn}
              recipient={recipient}
              morphMode={morphMode}
              treeColor={treeColor}
              gestureState={gestureState}
            />
          )}
        </Suspense>
      </Canvas>
    </>
  );
}
