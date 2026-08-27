// La antiguedad de la deuda vive en el modelo canonico compartido, para que el
// saldo que ve el cliente en pantalla y el que le llega por email no puedan
// divergir: es literalmente el mismo codigo, no dos copias que se parecen.
//
// Este fichero solo reexporta con los nombres que ya usaba el frontend.
export {
  agingSentence,
  computeAging,
  daysBetweenInStoreZone,
  isOverdue,
  OVERDUE_THRESHOLD_DAYS,
  STORE_TIME_ZONE,
} from '../../supabase/functions/_shared/account-summary'
export type { AgingResult as ClientAging, DebtSlice } from '../../supabase/functions/_shared/account-summary'
