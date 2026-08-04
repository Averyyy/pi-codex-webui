"use client"

import * as React from "react"

interface UiLabels {
  close: string
  sidebarTitle: string
  sidebarDescription: string
  toggleSidebar: string
  resizeSidebar: string
}

const defaultUiLabels: UiLabels = {
  close: "Close",
  sidebarTitle: "Sidebar",
  sidebarDescription: "Displays the mobile sidebar.",
  toggleSidebar: "Toggle Sidebar",
  resizeSidebar: "Resize the sidebar; click to collapse or expand",
}

const UiLabelsContext = React.createContext<UiLabels>(defaultUiLabels)

function UiLabelsProvider({
  children,
  close = defaultUiLabels.close,
  sidebarTitle = defaultUiLabels.sidebarTitle,
  sidebarDescription = defaultUiLabels.sidebarDescription,
  toggleSidebar = defaultUiLabels.toggleSidebar,
  resizeSidebar = defaultUiLabels.resizeSidebar,
}: React.PropsWithChildren<Partial<UiLabels>>) {
  const value = React.useMemo(
    () => ({
      close,
      sidebarTitle,
      sidebarDescription,
      toggleSidebar,
      resizeSidebar,
    }),
    [close, sidebarTitle, sidebarDescription, toggleSidebar, resizeSidebar]
  )

  return (
    <UiLabelsContext.Provider value={value}>
      {children}
    </UiLabelsContext.Provider>
  )
}

function useUiLabels() {
  return React.useContext(UiLabelsContext)
}

export { UiLabelsProvider, useUiLabels }
