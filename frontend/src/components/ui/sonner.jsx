"use client";
import { useEffect, useState } from "react"
import { Toaster as Sonner } from "sonner"

const getTheme = () => {
  if (typeof document === "undefined") {
    return "light"
  }

  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

const Toaster = ({
  ...props
}) => {
  const [theme, setTheme] = useState(getTheme)

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined
    }

    const root = document.documentElement
    const syncTheme = () => setTheme(root.classList.contains("dark") ? "dark" : "light")
    const observer = new MutationObserver(syncTheme)

    syncTheme()
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })

    return () => observer.disconnect()
  }, [])

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props} />
  );
}

export { Toaster }
