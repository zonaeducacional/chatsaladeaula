/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  deleteDoc, 
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from './firebase';
import { 
  MessageSquare, 
  ShieldCheck, 
  User, 
  LogOut, 
  Plus, 
  Check, 
  X, 
  Trash2, 
  ArrowLeft,
  Send,
  Loader2,
  Sun,
  Moon,
  Bell
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';

// Utility for Tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
type Role = 'aluno' | 'admin';

interface Message {
  id: string;
  nome: string;
  turma?: string;
  papel: Role;
  texto: string;
  ts: Timestamp;
  marcado?: string; // Name of the student tagged in this message
}

type Screen = 'home' | 'student-login' | 'teacher-login' | 'admin' | 'chat';

// --- Constants ---
const TEACHER_PASSWORD = 'j1junior';

// --- Helper Functions ---
const generateCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [user, setUser] = useState<{ nome: string; papel: Role; turma?: string } | null>(null);
  const [roomCode, setRoomCode] = useState<string>('');
  const [studentTurma, setStudentTurma] = useState<string>('');
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingMessages, setPendingMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showPendingNotice, setShowPendingNotice] = useState(false);
  const [showAdminNotification, setShowAdminNotification] = useState(false);
  const [taggedStudent, setTaggedStudent] = useState<string | null>(null);
  const lastPendingCount = useRef(0);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
    }
    return 'light';
  });

  useEffect(() => {
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const scrollRef = useRef<HTMLDivElement>(null);

  // --- Real-time Listeners ---
  useEffect(() => {
    // Listen to room code
    const unsubCode = onSnapshot(doc(db, 'sala', 'info'), (doc) => {
      if (doc.exists()) {
        setActiveCode(doc.data().codigo);
      } else {
        setActiveCode(null);
      }
      setLoading(false);
    });

    // Listen to approved messages
    const qMessages = query(collection(db, 'sala', 'info', 'mensagens'), orderBy('ts', 'asc'));
    const unsubMessages = onSnapshot(qMessages, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(msgs);
    });

    // Listen to pending messages (only if admin)
    let unsubPending = () => {};
    if (user?.papel === 'admin') {
      const qPending = query(collection(db, 'sala', 'info', 'pendentes'), orderBy('ts', 'asc'));
      unsubPending = onSnapshot(qPending, (snapshot) => {
        const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
        setPendingMessages(msgs);
      });
    }

    return () => {
      unsubCode();
      unsubMessages();
      unsubPending();
    };
  }, [user]);

  // --- Notification for Admin ---
  useEffect(() => {
    if (user?.papel === 'admin' && pendingMessages.length > lastPendingCount.current) {
      setShowAdminNotification(true);
      const timer = setTimeout(() => setShowAdminNotification(false), 4000);
      return () => clearTimeout(timer);
    }
    lastPendingCount.current = pendingMessages.length;
  }, [pendingMessages, user]);

  // --- Auto-scroll ---
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // --- Actions ---
  const handleGenerateCode = async () => {
    try {
      const newCode = generateCode();
      await setDoc(doc(db, 'sala', 'info'), { codigo: newCode });
    } catch (err) {
      console.error("Erro ao gerar código:", err);
      setError("Erro ao salvar o código no banco de dados. Verifique sua conexão.");
    }
  };

  const handleStudentLogin = async (name: string, turma: string, code: string) => {
    setError(null);
    if (!name.trim()) {
      setError('Por favor, digite seu nome.');
      return;
    }
    if (!turma.trim()) {
      setError('Por favor, digite sua turma.');
      return;
    }
    if (code.toUpperCase() !== activeCode) {
      setError('Código da sala inválido ou inativo.');
      return;
    }
    setUser({ nome: name.trim(), turma: turma.trim(), papel: 'aluno' });
    setScreen('chat');
  };

  const handleTeacherLogin = (password: string) => {
    setError(null);
    if (password === TEACHER_PASSWORD) {
      setUser({ nome: 'Professor', papel: 'admin' });
      setScreen('admin');
    } else {
      setError('Senha incorreta.');
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !user) return;
    setIsSending(true);
    const msgData: any = {
      nome: user.nome,
      turma: user.turma || '',
      papel: user.papel,
      texto: inputText.trim(),
      ts: serverTimestamp(),
    };

    if (user.papel === 'admin' && taggedStudent) {
      msgData.marcado = taggedStudent;
    }

    try {
      if (user.papel === 'admin') {
        await addDoc(collection(db, 'sala', 'info', 'mensagens'), msgData);
        setTaggedStudent(null);
      } else {
        await addDoc(collection(db, 'sala', 'info', 'pendentes'), msgData);
        setShowPendingNotice(true);
        setTimeout(() => setShowPendingNotice(false), 3000);
      }
      setInputText('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  const approveMessage = async (msg: Message) => {
    const { id, ...data } = msg;
    await addDoc(collection(db, 'sala', 'info', 'mensagens'), data);
    await deleteDoc(doc(db, 'sala', 'info', 'pendentes', id));
  };

  const replyToStudent = (studentName: string) => {
    setTaggedStudent(studentName);
    setScreen('chat');
  };

  const rejectMessage = async (id: string) => {
    await deleteDoc(doc(db, 'sala', 'info', 'pendentes', id));
  };

  const deleteMessage = async (id: string) => {
    await deleteDoc(doc(db, 'sala', 'info', 'mensagens', id));
  };

  const logout = () => {
    setUser(null);
    setScreen('home');
    setError(null);
  };

  // --- Renderers ---
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className={cn(
      "min-h-screen font-sans transition-colors duration-300",
      theme === 'dark' ? "bg-gray-950 text-gray-100 selection:bg-gray-800" : "bg-gray-50 text-gray-900 selection:bg-gray-200"
    )}>
      <div className={cn(
        "max-w-md mx-auto min-h-screen flex flex-col shadow-sm border-x transition-colors duration-300 relative",
        theme === 'dark' ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"
      )}>
        <AnimatePresence>
          {showAdminNotification && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 10 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-4 left-4 right-4 z-50 pointer-events-none"
            >
              <div className="mx-auto max-w-fit bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2 rounded-full shadow-xl flex items-center gap-2 border border-white/10 dark:border-gray-200">
                <Bell className="w-3.5 h-3.5 animate-bounce" />
                <span className="text-xs font-bold">Nova mensagem pendente</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {screen === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 flex flex-col items-center justify-center p-8 space-y-6 relative"
            >
              <button 
                onClick={toggleTheme}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                {theme === 'light' ? <Moon className="w-5 h-5 text-gray-500" /> : <Sun className="w-5 h-5 text-amber-400" />}
              </button>
              <div className="w-16 h-16 bg-gray-900 dark:bg-white rounded-2xl flex items-center justify-center mb-4">
                <MessageSquare className="text-white dark:text-gray-900 w-8 h-8" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-center">Chat da Sala</h1>
              <div className="text-center space-y-1">
                <p className="text-gray-600 dark:text-gray-300 font-medium text-sm">LPT e LP</p>
                <p className="text-gray-400 dark:text-gray-500 text-xs italic">Profº Sérgio Araújo</p>
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-center text-sm">Bem-vindo ao sistema de interação em tempo real.</p>
              
              <div className="w-full space-y-3 pt-4">
                <button 
                  onClick={() => setScreen('student-login')}
                  className="w-full py-3 px-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
                >
                  <User className="w-4 h-4" />
                  Entrar com código
                </button>
                <button 
                  onClick={() => setScreen('teacher-login')}
                  className="w-full py-3 px-4 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  Acesso do professor
                </button>
              </div>
            </motion.div>
          )}

          {screen === 'student-login' && (
            <motion.div 
              key="student-login"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex-1 flex flex-col p-8"
            >
              <button onClick={() => setScreen('home')} className="self-start p-2 -ml-2 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="mt-8 space-y-6">
                <div>
                  <h2 className="text-xl font-bold tracking-tight">Entrar como Aluno</h2>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Digite o código da sala e seu nome.</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Código da Sala</label>
                    <input 
                      type="text"
                      placeholder="EX: AB3X9K"
                      maxLength={6}
                      className="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900/5 dark:focus:ring-white/5 focus:border-gray-900 dark:focus:border-white font-mono uppercase text-center text-lg tracking-widest text-gray-900 dark:text-white"
                      onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Seu Nome</label>
                    <input 
                      type="text"
                      placeholder="Como quer ser chamado?"
                      className="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900/5 dark:focus:ring-white/5 focus:border-gray-900 dark:focus:border-white text-gray-900 dark:text-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sua Turma</label>
                    <input 
                      type="text"
                      placeholder="Ex: 9º M1"
                      className="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900/5 dark:focus:ring-white/5 focus:border-gray-900 dark:focus:border-white text-gray-900 dark:text-white"
                      value={studentTurma}
                      onChange={(e) => setStudentTurma(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const nameInput = document.querySelector('input[placeholder="Como quer ser chamado?"]') as HTMLInputElement;
                          handleStudentLogin(nameInput.value, studentTurma, roomCode);
                        }
                      }}
                    />
                  </div>
                  {error && <p className="text-red-500 text-xs font-medium">{error}</p>}
                  <button 
                    onClick={() => {
                      const nameInput = document.querySelector('input[placeholder="Como quer ser chamado?"]') as HTMLInputElement;
                      handleStudentLogin(nameInput.value, studentTurma, roomCode);
                    }}
                    className="w-full py-3 px-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
                  >
                    Entrar na Sala
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {screen === 'teacher-login' && (
            <motion.div 
              key="teacher-login"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex-1 flex flex-col p-8"
            >
              <button onClick={() => setScreen('home')} className="self-start p-2 -ml-2 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="mt-8 space-y-6">
                <div>
                  <h2 className="text-xl font-bold tracking-tight">Acesso do Professor</h2>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Digite sua senha para acessar o painel.</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Senha</label>
                    <input 
                      type="password"
                      placeholder="••••••••"
                      className="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900/5 dark:focus:ring-white/5 focus:border-gray-900 dark:focus:border-white text-gray-900 dark:text-white"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleTeacherLogin((e.target as HTMLInputElement).value);
                      }}
                    />
                  </div>
                  {error && <p className="text-red-500 text-xs font-medium">{error}</p>}
                  <button 
                    onClick={() => {
                      const passInput = document.querySelector('input[type="password"]') as HTMLInputElement;
                      handleTeacherLogin(passInput.value);
                    }}
                    className="w-full py-3 px-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
                  >
                    Entrar no Painel
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {screen === 'admin' && (
            <motion.div 
              key="admin"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col"
            >
              <header className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-900 z-10 transition-colors">
                <h2 className="font-bold tracking-tight">Painel Admin</h2>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={toggleTheme}
                    className="p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                    title="Alternar Tema"
                  >
                    {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5 text-amber-400" />}
                  </button>
                  <button 
                    onClick={() => setScreen('chat')}
                    className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                    title="Ir para o Chat"
                  >
                    <MessageSquare className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={logout}
                    className="p-2 text-red-500 hover:text-red-600 transition-colors"
                    title="Sair"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              </header>

              <div className="p-4 space-y-8">
                {/* Código de Acesso */}
                <section className="space-y-3">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Código de Acesso</h3>
                  <div className="p-6 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-800 flex flex-col items-center gap-4 transition-colors">
                    {activeCode ? (
                      <div className="text-3xl font-mono font-bold tracking-[0.2em] text-gray-900 dark:text-white">{activeCode}</div>
                    ) : (
                      <div className="text-sm text-gray-400 italic">Nenhum código ativo</div>
                    )}
                    <button 
                      onClick={handleGenerateCode}
                      className="w-full py-2.5 px-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                      <Plus className="w-4 h-4" />
                      Gerar novo código
                    </button>
                    {error && <p className="text-red-500 text-[10px] font-medium text-center">{error}</p>}
                  </div>
                </section>

                {/* Mensagens Pendentes */}
                <section className="space-y-3">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center justify-between">
                    Mensagens Pendentes
                    <span className="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full text-[10px]">{pendingMessages.length}</span>
                  </h3>
                  <div className="space-y-2">
                    {pendingMessages.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-8">Nenhuma mensagem aguardando.</p>
                    ) : (
                      pendingMessages.map(msg => (
                        <div key={msg.id} className="p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-800 rounded-xl shadow-sm space-y-3 transition-colors">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-gray-900 dark:text-white">{msg.nome}</span>
                                {msg.turma && <span className="text-[10px] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-500 dark:text-gray-400">{msg.turma}</span>}
                              </div>
                              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{msg.texto}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <button 
                              onClick={() => approveMessage(msg)}
                              className="flex-1 py-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg text-xs font-bold hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors flex items-center justify-center gap-1.5"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Aprovar
                            </button>
                            <button 
                              onClick={() => replyToStudent(msg.nome)}
                              className="flex-1 py-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-lg text-xs font-bold hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors flex items-center justify-center gap-1.5"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              Responder
                            </button>
                            <button 
                              onClick={() => rejectMessage(msg.id)}
                              className="flex-1 py-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-xs font-bold hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex items-center justify-center gap-1.5"
                            >
                              <X className="w-3.5 h-3.5" />
                              Rejeitar
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                {/* Mensagens Aprovadas */}
                <section className="space-y-3 pb-8">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Mensagens Aprovadas</h3>
                  <div className="space-y-2">
                    {messages.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-8">Chat vazio.</p>
                    ) : (
                      messages.map(msg => (
                        <div key={msg.id} className="group p-3 bg-gray-50/50 dark:bg-gray-800/30 rounded-xl flex items-center justify-between gap-4 transition-colors">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={cn("text-[10px] font-bold uppercase tracking-wider", msg.papel === 'admin' ? "text-amber-600" : "text-gray-400 dark:text-gray-500")}>
                                {msg.nome}
                              </span>
                              <span className="text-[10px] text-gray-300 dark:text-gray-600">
                                {msg.ts ? format(msg.ts.toDate(), 'HH:mm') : '...'}
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 dark:text-gray-400 truncate mt-0.5">{msg.texto}</p>
                          </div>
                          <button 
                            onClick={() => deleteMessage(msg.id)}
                            className="p-2 text-gray-300 dark:text-gray-700 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            </motion.div>
          )}

          {screen === 'chat' && (
            <motion.div 
              key="chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col h-screen overflow-hidden"
            >
              <header className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-900 shrink-0 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-900 dark:bg-white rounded-lg flex items-center justify-center">
                    <MessageSquare className="text-white dark:text-gray-900 w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold tracking-tight">Sala de Aula</h2>
                    <p className="text-[10px] text-green-500 font-medium flex items-center gap-1">
                      <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                      Ao vivo
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={toggleTheme}
                    className="p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                    title="Alternar Tema"
                  >
                    {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5 text-amber-400" />}
                  </button>
                  {user?.papel === 'admin' && (
                    <button 
                      onClick={() => setScreen('admin')}
                      className="p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors relative"
                    >
                      <ShieldCheck className="w-5 h-5" />
                      {pendingMessages.length > 0 && (
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full border-2 border-white dark:border-gray-900" />
                      )}
                    </button>
                  )}
                  <button 
                    onClick={logout}
                    className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              </header>

              {/* Chat Area */}
              <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/30 dark:bg-gray-950/30 transition-colors"
              >
                {messages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-2 opacity-40">
                    <MessageSquare className="w-8 h-8 text-gray-300 dark:text-gray-700" />
                    <p className="text-sm text-gray-400 dark:text-gray-600">Nenhuma mensagem ainda.<br/>Seja o primeiro a falar!</p>
                  </div>
                )}
                {messages
                  .map((msg) => {
                    const isMe = msg.nome === user?.nome && msg.papel === user?.papel;
                    const isAdmin = msg.papel === 'admin';
                    const isForMe = msg.marcado === user?.nome;

                    return (
                      <div 
                        key={msg.id} 
                        className={cn(
                          "flex flex-col max-w-[85%] group",
                          isMe ? "ml-auto items-end" : "mr-auto items-start"
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1 px-1">
                          <span className={cn(
                            "text-[10px] font-bold uppercase tracking-wider", 
                            isAdmin ? "text-amber-600" : isMe ? "text-gray-500 dark:text-gray-400" : "text-gray-400 dark:text-gray-500"
                          )}>
                            {msg.nome}
                          </span>
                          {msg.turma && !isAdmin && <span className="text-[9px] text-gray-400 dark:text-gray-600">({msg.turma})</span>}
                          <span className="text-[10px] text-gray-300 dark:text-gray-600">
                            {msg.ts ? format(msg.ts.toDate(), 'dd/MM HH:mm') : '...'}
                          </span>
                          {user?.papel === 'admin' && (
                            <button 
                              onClick={() => deleteMessage(msg.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-300 dark:text-gray-700 hover:text-red-500"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <div 
                          className={cn(
                            "px-4 py-2.5 rounded-2xl text-sm shadow-sm transition-colors relative",
                            isMe ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-tr-none" : 
                            isAdmin ? "bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200 border border-amber-100 dark:border-amber-900/30 rounded-tl-none" : 
                            "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-100 dark:border-gray-700 rounded-tl-none",
                            isForMe && "ring-2 ring-amber-500 ring-offset-2 dark:ring-offset-gray-900"
                          )}
                        >
                          {msg.marcado && (
                            <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 mb-1 flex items-center gap-1">
                              <User className="w-3 h-3" />
                              @{msg.marcado}
                            </div>
                          )}
                          {msg.texto}
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Input Area */}
              <div className="p-4 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 shrink-0 transition-colors">
                <AnimatePresence>
                  {showPendingNotice && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute bottom-24 left-4 right-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[10px] py-2 px-4 rounded-full text-center font-medium shadow-lg z-20 transition-colors"
                    >
                      Sua mensagem foi enviada para aprovação do professor.
                    </motion.div>
                  )}
                </AnimatePresence>
                
                <div className="flex items-center gap-2">
                  {user?.papel === 'admin' && (
                    <div className="relative group">
                      <button 
                        onClick={() => {
                          const students = Array.from(new Set([...messages, ...pendingMessages].filter(m => m.papel === 'aluno').map(m => m.nome)));
                          const name = prompt("Nome do aluno para marcar:", taggedStudent || "");
                          if (name !== null) setTaggedStudent(name || null);
                        }}
                        className={cn(
                          "p-3 rounded-xl border transition-colors",
                          taggedStudent ? "bg-amber-100 border-amber-300 text-amber-700" : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400"
                        )}
                        title="Marcar Aluno"
                      >
                        <User className="w-5 h-5" />
                      </button>
                      {taggedStudent && (
                        <button 
                          onClick={() => setTaggedStudent(null)}
                          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px]"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                  <input 
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={taggedStudent ? `Mensagem para @${taggedStudent}...` : "Escreva sua mensagem..."}
                    className="flex-1 p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900/5 dark:focus:ring-white/5 focus:border-gray-900 dark:focus:border-white text-sm text-gray-900 dark:text-white transition-colors"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') sendMessage();
                    }}
                  />
                  <button 
                    onClick={sendMessage}
                    disabled={!inputText.trim() || isSending}
                    className="p-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-gray-900 dark:disabled:hover:bg-white transition-all active:scale-95"
                  >
                    {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
