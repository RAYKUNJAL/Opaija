import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Play, Sparkles, Zap } from "lucide-react";

export function OpaijaMotionHero() {
  const [strike, setStrike] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStrike((value) => value + 1);
    }, 3600);
    return () => window.clearInterval(timer);
  }, []);

  const shards = useMemo(
    () =>
      Array.from({ length: 28 }).map((_, index) => ({
        id: index,
        x: Math.random() * 720 - 360,
        y: Math.random() * 260 - 120,
        r: Math.random() * 180 - 90,
        d: Math.random() * 0.7,
        s: Math.random() * 0.65 + 0.45,
      })),
    [strike],
  );

  const sparks = useMemo(
    () =>
      Array.from({ length: 42 }).map((_, index) => ({
        id: index,
        x: Math.random() * 900 - 450,
        y: Math.random() * 460 - 230,
        d: Math.random() * 1.4,
        s: Math.random() * 5 + 2,
      })),
    [strike],
  );

  return (
    <section className="motion-hero">
      <div className="motion-hero-bg" />
      <div className="motion-grid-bg" />

      <motion.div
        className="motion-orb motion-orb-cyan"
        animate={{ scale: [1, 1.25, 1], opacity: [0.18, 0.38, 0.18] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="motion-orb motion-orb-gold"
        animate={{ scale: [1.1, 0.85, 1.1], opacity: [0.18, 0.32, 0.18] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="motion-hero-inner">
        <div className="motion-hero-copy">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="motion-badge"
          >
            <Zap size={16} />
            Caribbean anime fantasy universe
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
          >
            When the seed awakens,
            <span>legends break free.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.22 }}
          >
            A cinematic animated hero section for OPAIJA: the main stick-fighter channels
            island power, strikes the franchise name, and shatters it with lightning-force
            energy.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.34 }}
            className="motion-actions"
          >
            <button className="motion-primary" type="button">
              Watch the teaser
              <Play size={20} />
            </button>
            <button className="motion-secondary" type="button">
              <Sparkles size={20} />
              Enter Opaija
            </button>
          </motion.div>
        </div>

        <div className="motion-stage">
          <motion.div
            key={`flash-${strike}`}
            className="motion-flash"
            initial={{ scale: 0.35, opacity: 0 }}
            animate={{ scale: [0.45, 1.2, 0.85], opacity: [0, 0.78, 0] }}
            transition={{ duration: 0.82, ease: "easeOut" }}
          />

          <motion.div
            className="motion-shadow"
            animate={{ scaleX: [0.92, 1.05, 0.92], opacity: [0.45, 0.75, 0.45] }}
            transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
          />

          <div className="motion-word-wrap">
            <motion.div
              key={`word-${strike}`}
              initial={{ rotateX: 18, rotateY: -18, scale: 1 }}
              animate={{
                rotateX: [18, 18, 24, 16],
                rotateY: [-18, -18, -24, -12],
                scale: [1, 1, 1.08, 0.98],
                filter: [
                  "drop-shadow(0 0 18px rgba(34,211,238,.45))",
                  "drop-shadow(0 0 18px rgba(34,211,238,.45))",
                  "drop-shadow(0 0 70px rgba(255,224,102,.95))",
                  "drop-shadow(0 0 28px rgba(34,211,238,.45))",
                ],
              }}
              transition={{ duration: 1.1, ease: "easeOut" }}
              className="motion-word"
            >
              OPAIJA
            </motion.div>

            {shards.map((shard) => (
              <motion.span
                key={`${strike}-${shard.id}`}
                className="motion-shard"
                initial={{ x: 0, y: 0, rotate: 0, scale: 0, opacity: 0 }}
                animate={{
                  x: [0, shard.x],
                  y: [0, shard.y],
                  rotate: [0, shard.r],
                  scale: [0, shard.s, 0],
                  opacity: [0, 1, 0],
                }}
                transition={{ duration: 0.95, delay: 0.22 + shard.d * 0.15, ease: "easeOut" }}
              />
            ))}
          </div>

          <motion.div
            className="motion-fighter"
            animate={{ y: [0, -10, 0], rotateY: [0, -6, 0] }}
            transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
          >
            <motion.div
              key={`fighter-${strike}`}
              className="motion-body"
              animate={{ rotate: [0, 0, -8, 2], x: [0, 0, -14, 0] }}
              transition={{ duration: 1.1, ease: "easeOut" }}
            />

            <motion.div
              className="motion-head"
              animate={{ rotate: [0, -4, 0] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
            >
              <span className="motion-eye motion-eye-left" />
              <span className="motion-eye motion-eye-right" />
              <span className="motion-mouth" />
            </motion.div>

            <motion.div
              key={`stick-${strike}`}
              className="motion-stick"
              initial={{ rotate: -96, x: -78, y: -10 }}
              animate={{
                rotate: [-96, -86, 48, 40],
                x: [-78, -74, 98, 88],
                y: [-10, -18, 72, 66],
              }}
              transition={{ duration: 1.08, ease: [0.16, 1, 0.3, 1] }}
            />

            <motion.div
              className="motion-arm motion-arm-left"
              animate={{ rotate: [-18, -23, 12, -10], x: [0, -4, 26, 0] }}
              transition={{ duration: 1.1, ease: "easeOut" }}
            />
            <motion.div
              className="motion-arm motion-arm-right"
              animate={{ rotate: [20, 28, -12, 18], x: [0, 5, -20, 0] }}
              transition={{ duration: 1.1, ease: "easeOut" }}
            />
            <div className="motion-leg motion-leg-left" />
            <div className="motion-leg motion-leg-right" />
          </motion.div>

          <motion.svg
            key={`bolt-${strike}`}
            className="motion-bolts"
            viewBox="0 0 900 620"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.2, 0] }}
            transition={{ duration: 0.95, ease: "easeOut" }}
          >
            <filter id="glow">
              <feGaussianBlur stdDeviation="4" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <path d="M490 185 L570 245 L515 258 L642 372 L520 315 L550 295 L445 222" fill="none" stroke="#a5f3fc" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)" />
            <path d="M410 222 L300 288 L362 300 L248 402 L380 336 L346 318 L456 250" fill="none" stroke="#fde68a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)" />
            <path d="M480 302 L430 378 L465 370 L412 505 L506 372 L474 382 L548 292" fill="none" stroke="#67e8f9" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)" />
          </motion.svg>

          {sparks.map((spark) => (
            <motion.span
              key={`${strike}-spark-${spark.id}`}
              className="motion-spark"
              style={{ height: spark.s, width: spark.s }}
              initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
              animate={{ x: spark.x, y: spark.y, opacity: [0, 1, 0], scale: [0, 1.5, 0] }}
              transition={{ duration: 1.2, delay: 0.18 + spark.d * 0.2, ease: "easeOut" }}
            />
          ))}

          <div className="motion-ground" />
        </div>
      </div>
    </section>
  );
}
