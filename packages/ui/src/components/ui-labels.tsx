"use client"

import * as React from "react"

interface UiLabels {
  close: string
  sidebarTitle: string
  sidebarDescription: string
  toggleSidebar: string
}

const defaultUiLabels: UiLabels = {
  close: "Close",
  sidebarTitle: "Sidebar",
  sidebarDescription: "Displays the mobile sidebar.",
  toggleSidebar: "Toggle Sidebar",
}

const UiLabelsContext = React.createContext<UiLabels>(defaultUiLabels)

function UiLabelsProvider({
  children,
  close = defaultUiLabels.close,
  sidebarTitle = defaultUiLabels.sidebarTitle,
  sidebarDescription = defaultUiLabels.sidebarDescription,
  toggleSidebar = defaultUiLabels.toggleSidebar,
}: React.PropsWithChildren<Partial<UiLabels>>) {
  const value = React.useMemo(
    () => ({ close, sidebarTitle, sidebarDescription, toggleSidebar }),
    [close, sidebarTitle, sidebarDescription, toggleSidebar]
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
