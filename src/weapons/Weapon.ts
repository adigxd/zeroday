export type WeaponId =
  | 'knife' | 'mace' | 'sword'
  | 'pistol' | 'rifle' | 'sniper' | 'laser' | 'bow' | 'rpg';

export interface WeaponDef {
  id:       WeaponId;
  damage:   number;
  cooldown: number; // ms
  isMelee:  boolean;
}
