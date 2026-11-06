import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

const VERTEX = /* glsl */ `
  attribute float aScale;
  attribute float aPhase;
  attribute vec3 color;
  uniform float uTime;
  uniform float uAmp;
  varying vec3 vColor;
  varying float vFade;

  void main() {
    vColor = color;
    vec3 pos = position;
    vec3 dir = normalize(pos + 0.0001);
    float wave = sin(uTime * 0.55 + aPhase) * uAmp;
    pos += dir * wave;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = (aScale * 78.0) / max(0.001, -mv.z);
    gl_Position = projectionMatrix * mv;
    vFade = smoothstep(0.0, 1.4, -mv.z);
  }
`;

const FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vFade;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float alpha = smoothstep(0.5, 0.02, d);
    alpha = pow(alpha, 2.2) * 0.92;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

function parseColor(hex) {
  return new THREE.Color(hex);
}

/**
 * Real WebGL scene: an orbital lattice of ~9k additive points around a
 * wireframe crystal core, three orbital rings and a soft bloom sprite.
 * Pauses when offscreen or when the tab is hidden, and respects reduced motion.
 */
export default function Scene3D({ className = '', variant = 'hero', intensity = 1 }) {
  const holderRef = useRef(null);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMobile = window.matchMedia('(max-width: 760px)').matches;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      return undefined;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
    camera.position.set(0, 0, 7.4);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.6 : 2));
    renderer.setClearColor(0x000000, 0);
    holder.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';

    const group = new THREE.Group();
    scene.add(group);

    const violet = parseColor('#a58bff');
    const lavender = parseColor('#e0d4ff');
    const mint = parseColor('#7ef0c5');
    const warm = parseColor('#ffcb8a');

    /* ── particle lattice ── */
    const count = isMobile ? 3600 : 9200;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const phases = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
      const shell = Math.pow(Math.random(), 0.62);
      const radius = 1.25 + shell * 2.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const flatten = 0.58 + Math.random() * 0.32;
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.cos(phi) * flatten + 0.12;
      const z = radius * Math.sin(phi) * Math.sin(theta);
      const jitter = 0.14;
      positions[i * 3] = x + (Math.random() - 0.5) * jitter;
      positions[i * 3 + 1] = y + (Math.random() - 0.5) * jitter;
      positions[i * 3 + 2] = z + (Math.random() - 0.5) * jitter;

      const t = Math.min(1, Math.max(0, (y + 2.4) / 4.6));
      const color = new THREE.Color();
      if (t < 0.42) color.copy(violet).lerp(lavender, t / 0.42);
      else if (t < 0.78) color.copy(lavender).lerp(mint, (t - 0.42) / 0.36);
      else color.copy(mint).lerp(warm, (t - 0.78) / 0.22);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      scales[i] = 0.045 + Math.random() * 0.11;
      phases[i] = Math.random() * Math.PI * 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAmp: { value: variant === 'hero' ? 0.055 : 0.035 },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    group.add(points);

    /* ── crystal core ── */
    const coreGeometry = new THREE.IcosahedronGeometry(1.34, 1);
    const coreEdges = new THREE.EdgesGeometry(coreGeometry);
    const core = new THREE.LineSegments(
      coreEdges,
      new THREE.LineBasicMaterial({ color: 0xc7b4ff, transparent: true, opacity: 0.32 })
    );
    group.add(core);

    const innerCore = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.6, 0)),
      new THREE.LineBasicMaterial({ color: 0x7ef0c5, transparent: true, opacity: 0.42 })
    );
    group.add(innerCore);

    /* ── orbital rings ── */
    const rings = [];
    for (let i = 0; i < 3; i += 1) {
      const radius = 2.35 + i * 0.32;
      const ring = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(
          Array.from({ length: 220 }, (_, index) => {
            const angle = (index / 220) * Math.PI * 2;
            return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
          }).concat([new THREE.Vector3(radius, 0, 0)])
        ),
        new THREE.LineBasicMaterial({
          color: i === 1 ? 0x7ef0c5 : 0xa58bff,
          transparent: true,
          opacity: 0.18 + i * 0.04,
        })
      );
      ring.rotation.x = Math.PI / 2.6 + i * 0.36;
      ring.rotation.z = i * 0.5;
      rings.push(ring);
      group.add(ring);
    }

    /* ── glow sprite ── */
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(198,180,255,0.85)');
    gradient.addColorStop(0.35, 'rgba(140,110,255,0.28)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.8,
      })
    );
    glow.scale.set(6, 6, 1);
    glow.position.z = -0.4;
    group.add(glow);

    group.rotation.x = -0.16;

    /* ── interaction ── */
    const pointer = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    const onPointerMove = (event) => {
      const rect = holder.getBoundingClientRect();
      target.x = ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2;
      target.y = ((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2;
    };
    if (!reduced) window.addEventListener('pointermove', onPointerMove, { passive: true });

    const resize = () => {
      const width = holder.clientWidth || 1;
      const height = holder.clientHeight || 1;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const scale = width < 720 ? 0.82 : 1;
      group.scale.setScalar(scale);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(holder);

    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    }, { threshold: 0.02 });
    io.observe(holder);

    let raf = 0;
    let last = performance.now();
    const clock = new THREE.Clock();

    const render = (now) => {
      raf = requestAnimationFrame(render);
      const delta = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible || document.hidden) return;

      const t = clock.getElapsedTime();
      material.uniforms.uTime.value = t;

      if (!reduced) {
        group.rotation.y += delta * 0.085 * intensity;
        core.rotation.x = t * 0.12;
        core.rotation.y = -t * 0.16;
        innerCore.rotation.y = t * 0.3;
        innerCore.rotation.z = t * 0.18;
        rings.forEach((ring, index) => {
          ring.rotation.y = t * (0.06 + index * 0.03);
        });
        pointer.x += (target.x - pointer.x) * 0.045;
        pointer.y += (target.y - pointer.y) * 0.045;
        camera.position.x = pointer.x * 0.55;
        camera.position.y = pointer.y * -0.35;
        camera.lookAt(0, 0, 0);
      }
      glow.material.opacity = 0.62 + Math.sin(t * 0.9) * 0.12;

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onPointerMove);
      observer.disconnect();
      io.disconnect();
      geometry.dispose();
      material.dispose();
      coreGeometry.dispose();
      coreEdges.dispose();
      core.geometry.dispose();
      core.material.dispose();
      innerCore.geometry.dispose();
      innerCore.material.dispose();
      rings.forEach((ring) => {
        ring.geometry.dispose();
        ring.material.dispose();
      });
      glow.material.map?.dispose();
      glow.material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === holder) holder.removeChild(renderer.domElement);
    };
  }, [variant, intensity]);

  return <div ref={holderRef} className={className} aria-hidden="true" />;
}
