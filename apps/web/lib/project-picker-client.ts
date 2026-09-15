export interface AddedProject {
  id: string
  name: string
  path: string
}

export interface ProjectDirectoryListing {
  path: string
  parent: string | null
  directories: { name: string; path: string }[]
}
