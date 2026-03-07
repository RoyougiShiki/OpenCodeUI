import { useState, useEffect, useRef } from 'react'

export function useInView(options: IntersectionObserverInit & { triggerOnce?: boolean } = {}) {
  const [inView, setInView] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true)
        if (options.triggerOnce) {
          observer.unobserve(element)
        }
      } else {
        if (!options.triggerOnce) {
          setInView(false)
        }
      }
    }, options)

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [options.triggerOnce, options.rootMargin])

  return { ref, inView }
}
