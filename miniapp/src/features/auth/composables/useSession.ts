import { storeToRefs } from 'pinia'
import { useSessionStore } from '../stores/session'

export function useSession() {
  const store = useSessionStore()
  const { state, user, permissions } = storeToRefs(store)
  return { store, state, user, permissions }
}
