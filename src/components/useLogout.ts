import { useCallback } from 'react'
import { signOut } from 'firebase/auth'
import { useNavigate } from 'react-router-dom'
import { auth } from '../services/firebase'

export function useLogout() {
  const navigate = useNavigate()
  return useCallback(async () => {
    await signOut(auth)
    navigate('/')
  }, [navigate])
}
