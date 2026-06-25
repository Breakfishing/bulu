// src/utils/firebase.js
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDg8nOLQfGVYZu57S5m0C-zccDGSrdtvg4",
  authDomain: "fishing-25978.firebaseapp.com",
  projectId: "fishing-25978",
  storageBucket: "fishing-25978.firebasestorage.app",
  messagingSenderId: "681283419168",
  appId: "1:681283419168:web:0cc86b6274c92f03d3d045",
  measurementId: "G-R7M94V4L0P"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export const db = firebase.firestore();
export const firebaseInstance = firebase;

// 기존 index.html이나 다른 파일에서 window.db로 접근하던 방식을 위해 전역 바인딩
window.db = db;
window.firebase = firebase;