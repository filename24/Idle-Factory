export const enum UserFlags {
  Default = 1 << 0,
  Root = 1 << 4,
}

export const enum GuildFlags {
  Default = 1 << 0,
  Root = 1 << 4,
}

export const enum ItemFlags {
  Common = 1 << 0,
  Rare = 1 << 1,
  Epic = 1 << 2,
  Emerald = 1 << 3,
  Legendery = 1 << 4,
}

export const enum FactoryFlags {
  Default = 1 << 0,
  Listed = 1 << 1,
  GlobalListed = 1 << 2,
  Delisted = 1 << 3,
  GlobalDelisted = 1 << 4,
}

export const enum FactoryType {
  Metal,
  Wood,
  Fab,
}
export const enum WorkerFlags {
  Common = 1 << 0,
  Rare = 1 << 1,
  Epic = 1 << 2,
  Emerald = 1 << 3,
  Legendery = 1 << 4,
}
