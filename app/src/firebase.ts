import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
    apiKey: "AIzaSyC2CGktR6PIKUE010gyNBNkKAgBiDLLVTM",
    authDomain: "night-run-uba.firebaseapp.com",
    projectId: "night-run-uba",
    storageBucket: "night-run-uba.firebasestorage.app",
    messagingSenderId: "952751315766",
    appId: "1:952751315766:web:3fef6461498f2ca8723197",
    measurementId: "G-W750FQSEMV"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
