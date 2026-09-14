import { useEffect, useRef } from 'react'

const COLORS = ['#e11d48', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899']
const DURATION_MS = 3200
const PARTICLE_COUNT = 48

interface Particle {
  x: number
  y: number
  size: number
  color: string
  vx: number
  vy: number
  rotation: number
  spin: number
}

/** Confeti liviano, no bloquea interacción (pointer-events-none). */
export function BirthdayConfetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let frameId = 0
    let running = true
    const start = performance.now()

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    resize()
    window.addEventListener('resize', resize)

    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.4,
      size: 6 + Math.random() * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      vx: (Math.random() - 0.5) * 2.4,
      vy: 2 + Math.random() * 3.2,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.18,
    }))

    const draw = (now: number) => {
      if (!running) return
      const elapsed = now - start
      const fade = elapsed > DURATION_MS - 600 ? (DURATION_MS - elapsed) / 600 : 1

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (const particle of particles) {
        particle.x += particle.vx
        particle.y += particle.vy
        particle.vy += 0.04
        particle.rotation += particle.spin

        ctx.save()
        ctx.globalAlpha = Math.max(0, fade)
        ctx.translate(particle.x, particle.y)
        ctx.rotate(particle.rotation)
        ctx.fillStyle = particle.color
        ctx.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2)
        ctx.restore()
      }

      if (elapsed < DURATION_MS) {
        frameId = requestAnimationFrame(draw)
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
    }

    frameId = requestAnimationFrame(draw)

    return () => {
      running = false
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-30"
    />
  )
}
