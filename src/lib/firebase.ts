import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
  AuthError,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Inicializar la aplicación Firebase si no está inicializada
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Inicializar Firestore con la base de datos específica o la default
export const db = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

// Inicializar Firebase Auth
export const auth = getAuth(app);

// Configurar Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

/**
 * Iniciar sesión con Google usando Popup (o Redirect para móviles si se especifica)
 */
export async function signInWithGoogle(useRedirect = false): Promise<FirebaseUser> {
  try {
    if (useRedirect) {
      await signInWithRedirect(auth, googleProvider);
      const result = await getRedirectResult(auth);
      if (result?.user) {
        return result.user;
      }
      throw new Error('No se completó la autenticación con redirección');
    }

    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    const authError = error as AuthError;
    console.error('Error al iniciar sesión con Google:', authError.code, authError.message);
    throw authError;
  }
}

/**
 * Cerrar sesión de Firebase Auth
 */
export async function signOutGoogle(): Promise<void> {
  try {
    await signOut(auth);
  } catch (error: any) {
    console.error('Error al cerrar sesión de Firebase:', error);
    throw error;
  }
}

/**
 * Obtener el usuario autenticado actualmente en Firebase Auth
 */
export function getCurrentAuthUser(): FirebaseUser | null {
  return auth.currentUser;
}

/**
 * Verificar si hay un usuario autenticado en Firebase Auth
 */
export function isUserAuthenticated(): boolean {
  return auth.currentUser !== null;
}

/**
 * Obtener un resumen estructurado del estado de autenticación
 */
export function getAuthStatus(): {
  isAuthenticated: boolean;
  user: FirebaseUser | null;
  email: string | null;
  uid: string | null;
  displayName: string | null;
} {
  const user = auth.currentUser;
  return {
    isAuthenticated: user !== null,
    user,
    email: user?.email || null,
    uid: user?.uid || null,
    displayName: user?.displayName || null,
  };
}

/**
 * Suscribirse a los cambios de estado de autenticación (onAuthStateChanged)
 */
export function subscribeToAuth(callback: (user: FirebaseUser | null) => void): () => void {
  return onAuthStateChanged(auth, (user) => {
    callback(user);
  });
}
