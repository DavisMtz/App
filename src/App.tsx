import React, { useEffect, useState, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, serverTimestamp, query, orderBy, onSnapshot } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { Mail, Phone, ExternalLink, X, Plus, LogIn, LogOut } from 'lucide-react';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null, localAuth: any) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: localAuth.currentUser?.uid,
      email: localAuth.currentUser?.email,
      emailVerified: localAuth.currentUser?.emailVerified,
      isAnonymous: localAuth.currentUser?.isAnonymous,
      tenantId: localAuth.currentUser?.tenantId,
      providerInfo: localAuth.currentUser?.providerData?.map((provider: any) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth();
const googleProvider = new GoogleAuthProvider();

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modals state
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showProfessionalModal, setShowProfessionalModal] = useState(false);
  const [showInquiryModal, setShowInquiryModal] = useState(false);
  
  // Data state
  const [professionals, setProfessionals] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]); // Future static or db projects
  
  // Refs for custom cursor and animation
  const cursorDotRef = useRef<HTMLDivElement>(null);
  const cursorRingRef = useRef<HTMLDivElement>(null);

  // Forms state
  const [profForm, setProfForm] = useState({ name: '', title: '', bio: '', contactEmail: '', linkedin: '', skills: '' });
  const [profMsg, setProfMsg] = useState({ text: '', isError: false });
  const [profSaving, setProfSaving] = useState(false);

  const [inqForm, setInqForm] = useState({ name: '', email: '', phone: '', businessName: '', idea: '' });
  const [inqMsg, setInqMsg] = useState({ text: '', isError: false });
  const [inqSaving, setInqSaving] = useState(false);
  
  useEffect(() => {
    // Auth listener
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setShowLoginModal(false);
      }
    });

    // Simulate initial loading
    setTimeout(() => {
      setIsLoading(false);
    }, 1300);

    // Fetch professionals
    const profQ = query(collection(db, 'professionals'), orderBy('createdAt', 'desc'));
    const unsubProfs = onSnapshot(profQ, (snapshot) => {
      const profData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProfessionals(profData);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'professionals', auth);
      } catch (e) {
        // Log handled above
      }
    });

    // Static placeholder projects
    setProjects([
      { id: '1', title: 'Sistema de Gestión Interna', desc: 'Desarrollo de CRM personalizado usando Google Workspace, integrando Sheets, Forms y Apps Script para automatizar el 100% de la gestión de leads.', tags: ['Apps Script', 'Google Workspace'] },
      { id: '2', title: 'Portal Corporativo', desc: 'Arquitectura de intranet corporativa centralizada, con single sign-on y directorios dinámicos.', tags: ['React', 'Firebase', 'IAM'] }
    ]);

    // Cleanup
    return () => {
      unsubscribe();
      unsubProfs();
    };
  }, []);

  // Custom Cursor Logic
  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!fine || !cursorDotRef.current || !cursorRingRef.current) return;

    const dot = cursorDotRef.current;
    const ring = cursorRingRef.current;
    let mx = window.innerWidth / 2, my = window.innerHeight / 2;
    let rx = mx, ry = my;

    const onMouseMove = (e: MouseEvent) => {
      mx = e.clientX; 
      my = e.clientY;
      if(dot) {
        dot.style.left = mx + 'px';
        dot.style.top = my + 'px';
      }
    };

    document.addEventListener('mousemove', onMouseMove, { passive: true });

    let animationFrameId: number;
    const loop = () => {
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      if(ring) {
        ring.style.left = rx + 'px';
        ring.style.top = ry + 'px';
      }
      animationFrameId = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isLoading]);

  // Handle Login
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error(error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error(error);
    }
  };

  // Submit Professional
  const submitProfessional = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setProfSaving(true);
    setProfMsg({ text: '', isError: false });
    
    try {
      const skillsArray = profForm.skills.split(',').map(s => s.trim()).filter(s => s);
      const profData = {
        userId: user.uid,
        name: profForm.name,
        title: profForm.title,
        bio: profForm.bio,
        skills: skillsArray.slice(0, 20), // Max 20
        contactEmail: profForm.contactEmail,
        contactPhone: '',
        linkedin: profForm.linkedin,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      await setDoc(doc(db, 'professionals', user.uid), profData);
      setProfMsg({ text: 'Perfil profesional actualizado exitosamente.', isError: false });
      setTimeout(() => setShowProfessionalModal(false), 2000);
    } catch (error: any) {
      if (error?.message && error.message.includes('Missing or insufficient permissions')) {
         try {
           handleFirestoreError(error, OperationType.WRITE, 'professionals/' + user.uid, auth);
         } catch(e: any) {
           setProfMsg({ text: 'Error de permisos al actualizar perfil: Verifica que todos los campos sean correctos y válidos.', isError: true });
         }
      } else {
         setProfMsg({ text: 'Error al actualizar perfil: ' + error.message, isError: true });
      }
    } finally {
      setProfSaving(false);
    }
  };

  // Submit Inquiry
  const submitInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    setInqSaving(true);
    setInqMsg({ text: '', isError: false });
    
    try {
      const inqData = {
        userId: user ? user.uid : '',
        name: inqForm.name,
        email: inqForm.email,
        phone: inqForm.phone,
        businessName: inqForm.businessName,
        idea: inqForm.idea,
        createdAt: serverTimestamp()
      };
      
      await addDoc(collection(db, 'inquiries'), inqData);
      setInqMsg({ text: 'Tu idea ha sido enviada exitosamente. Nos pondremos en contacto pronto.', isError: false });
      setInqForm({ name: '', email: '', phone: '', businessName: '', idea: '' });
      setTimeout(() => setShowInquiryModal(false), 3000);
    } catch (error: any) {
      if (error?.message && error.message.includes('Missing or insufficient permissions')) {
         try {
           handleFirestoreError(error, OperationType.CREATE, 'inquiries', auth);
         } catch(e: any) {
           setInqMsg({ text: 'Error de permisos al enviar idea: Verifica que todos los campos sean válidos.', isError: true });
         }
      } else {
        setInqMsg({ text: 'Error al enviar idea: ' + error.message, isError: true });
      }
    } finally {
      setInqSaving(false);
    }
  };

  // Cursor hover effects handler helper
  const handleMouseEnter = () => document.getElementById('cursorRing')?.classList.add('hover');
  const handleMouseLeave = () => document.getElementById('cursorRing')?.classList.remove('hover');

  const handleCellMouseMove = (e: React.MouseEvent<HTMLAnchorElement | HTMLDivElement>) => {
    const cell = e.currentTarget;
    const r = cell.getBoundingClientRect();
    cell.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    cell.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
  };

  useEffect(() => {
    if (isLoading) return;
    
    // Observers for revealing sections
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));
    
    const archPhoto = document.getElementById('archPhoto');
    if (archPhoto) {
      const ioPhoto = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            archPhoto.classList.add('in');
            ioPhoto.unobserve(archPhoto);
          }
        });
      }, { threshold: 0.3 });
      ioPhoto.observe(archPhoto);
    }

    const pq = document.getElementById('pullquote');
    if (pq) {
      const ioPq = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            pq.classList.add('in');
            ioPq.unobserve(pq);
          }
        });
      }, { threshold: 0.4 });
      ioPq.observe(pq);
    }

    return () => {
      io.disconnect();
    };
  }, [isLoading]);

  return (
    <>
      {isLoading && (
        <div className="loader" id="loader">
          <img className="loader__logo" src="https://github.com/DavisMtz/logidma-assets/blob/main/Logidma%20logo.png?raw=true" alt="Logidma" />
          <div className="loader__bar"></div>
          <div className="loader__text">Logidma · cargando</div>
        </div>
      )}

      <div className="ambient" aria-hidden="true"></div>
      
      <div className="cursor-dot" id="cursorDot" ref={cursorDotRef} aria-hidden="true"></div>
      <div className="cursor-ring" id="cursorRing" ref={cursorRingRef} aria-hidden="true"></div>

      <header className="nav" id="nav">
        <div className="nav__brand" onClick={() => window.scrollTo({top:0,behavior:'smooth'})}
             onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
          <img src="https://github.com/DavisMtz/logidma-assets/blob/main/Logidma%20logo.png?raw=true" alt="Logo Logidma" />
          <span>Logidma</span>
        </div>
        <div className="nav__meta">
          <span className="hidden-mobile"><span className="dot"></span>EN LÍNEA</span>
          
          {user ? (
            <div className="flex items-center gap-4">
              <span className="hidden sm:inline">Hola, {user.displayName}</span>
              <button 
                onClick={handleLogout}
                className="flex items-center gap-2 text-[var(--accent)] hover:underline"
                onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
                <LogOut size={14} /> SALIR
              </button>
            </div>
          ) : (
            <button 
              onClick={() => handleLogin()}
              className="flex items-center gap-2 text-[var(--cream)] hover:text-[var(--accent)] transition-colors"
              onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
              <LogIn size={14} /> ACCEDER
            </button>
          )}
        </div>
      </header>

      <main>
        {/* HERO SECTION */}
        <section className="hero">
          <div className="hero__label"><span>Bienvenido — la firma evolucionó</span></div>
          <h1 className="hero__title" id="heroTitle">
            <span className="word"><span className="inner" style={{'--d': '0.3s'} as any}>Evolucionamos.</span></span>{' '}
            <span className="word"><span className="inner" style={{'--d': '0.39s'} as any}>Ahora</span></span>{' '}
            <span className="word"><span className="inner" style={{'--d': '0.48s'} as any}>somos</span></span>{' '}
            <span className="word"><span className="inner" style={{'--d': '0.57s'} as any}><em>Logidma</em>.</span></span>
          </h1>
          <p className="hero__sub">
            Lo que conociste como <strong>DavarCore</strong> da paso a una mentalidad
            más afilada: <strong>ingeniería de sistemas y metacognición</strong>.
            Una firma que proyecta modernidad, cuidado estético y una visión
            orientada al futuro de la sistematización.
          </p>
          <div className="hero__transition">
            <span className="tag tag--old">Antes · DavarCore</span>
            <span className="arrow">→</span>
            <span className="tag tag--new">Ahora · Logidma</span>
          </div>

          <div className="hero__logo" id="heroLogo">
            <div className="hero__logo-inner">
              <img src="https://github.com/DavisMtz/logidma-assets/blob/main/Logidma%20logo.png?raw=true" alt="Logidma — emblema" />
            </div>
          </div>

          <div className="hero__scroll">DESCUBRIR</div>
        </section>

        {/* SCROLL MARQUEE */}
        <div className="marquee" aria-hidden="true" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
          <div className="marquee__track">
            <span className="marquee__item">Lógica</span>
            <span className="marquee__item">Estructura</span>
            <span className="marquee__item">Sistemas</span>
            <span className="marquee__item">Código</span>
            <span className="marquee__item">Arquitectura</span>
            <span className="marquee__item">Logidma</span>
            <span className="marquee__item">Lógica</span>
            <span className="marquee__item">Estructura</span>
            <span className="marquee__item">Sistemas</span>
            <span className="marquee__item">Código</span>
            <span className="marquee__item">Arquitectura</span>
            <span className="marquee__item">Logidma</span>
          </div>
        </div>

        {/* ETIMOLOGÍA */}
        <section className="wrap reveal reveal--stagger">
          <div className="section__head">
            <span className="num">01 /</span>
            <span className="title">Etimología y construcción del nombre</span>
          </div>

          <h2 className="kicker">Un neologismo técnico, diseñado <em>meticulosamente</em>.</h2>
          <p className="etym__intro">
            <strong>Logidma</strong> fusiona la ciencia computacional
            con la identidad de su creador. Dos pilares fundamentales sostienen la palabra:
          </p>

          <div className="etym">
            <div className="etym__cell" onMouseMove={handleCellMouseMove} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
              <div className="etym__big"><em>LOGI</em></div>
              <div className="etym__label">// Logos · Lógica</div>
              <p className="etym__body">
                En la filosofía griega clásica, el <strong>Logos (λόγος)</strong> es el
                principio del orden y del conocimiento; la razón estructural que rige
                el universo. En la ciencia computacional, la lógica es el lenguaje
                absoluto de las máquinas: la capacidad analítica para tomar un
                problema caótico, desarmarlo y traducirlo en algoritmos impecables.
              </p>
            </div>
            <div className="etym__cell" onMouseMove={handleCellMouseMove} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
              <div className="etym__big">DMA</div>
              <div className="etym__label">// David Martínez Arredondo</div>
              <p className="etym__body">
                Las iniciales del creador actúan como el <strong>núcleo de la marca</strong>.
                Es la firma personal integrada directamente en el código de la palabra,
                garantizando que —aunque la solución sea tecnológica y autónoma— el
                diseño y la arquitectura llevan un sello de autor indiscutible.
              </p>
            </div>
          </div>
        </section>

        {/* FILOSOFÍA */}
        <section className="wrap reveal">
          <div className="section__head">
            <span className="num">02 /</span>
            <span className="title">La filosofía detrás de la marca</span>
          </div>

          <div className="phil">
            <div className="phil__lead">
              Ver el <em>engranaje</em> oculto que sostiene la eficiencia.
            </div>
            <div className="phil__body">
              <p>
                Automatizar flujos de información —conectar bases de datos, estructurar
                interfaces en HTML/CSS, diseñar secuencias de ejecución en segundo
                plano— requiere mirar más allá de la superficie.
              </p>
              <p>
                <strong>Logidma</strong> nace para encapsular ese superpoder técnico:
                la capacidad de aplicar lógica donde hay fricción. Mientras los
                procesos manuales son susceptibles al error, la entropía y el desgaste
                humano, Logidma representa la imposición de un orden estructural
                limpio, estético y matemático.
              </p>
              <p>
                No es solo código; es el diseño de la <strong>cuadrícula invisible</strong>
                que sostiene la eficiencia corporativa y técnica.
              </p>
            </div>
          </div>

          <div className="pullquote" id="pullquote">
            Logidma es <em>la lógica, sistematizada</em>.
          </div>
        </section>

        {/* ARQUITECTO */}
        <section className="wrap reveal">
          <div className="section__head">
            <span className="num">03 /</span>
            <span className="title">El arquitecto detrás del código</span>
          </div>

          <div className="arch">
            <div className="arch__photo" id="archPhoto">
              <img src="https://lh3.googleusercontent.com/a/ACg8ocKb8u9IY4BT01_d_9d8g6fEW7PIz2cxRAcivCeGuPw1h2_eAlFa" alt="David Martínez Arredondo" referrerPolicy="no-referrer" />
            </div>
            <div>
              <div className="arch__role">// Founder · Systems Architect</div>
              <h3 className="arch__name">David Martínez Arredondo</h3>
              <p className="arch__bio">
                Arquitecto y desarrollador de sistemas internos. Especialista en
                Google Workspace, Apps Script, APIs e ingeniería HTML para entornos
                corporativos. Diseña la cuadrícula invisible: portales centralizados,
                CRMs automatizados y flujos donde antes había fricción manual.
              </p>

              <div className="arch__badge" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
                <a className="text-[var(--cream)] hover:text-[var(--accent)] underline font-mono text-sm tracking-widest"
                   href="https://mx.linkedin.com/in/david-martinez-arredondo-86b4182bb?trk=profile-badge"
                   target="_blank" rel="noopener noreferrer">
                  VER PERFIL COMPLETO
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* CONTACT INQUIRY SECTION (NEW) */}
        <section className="wrap reveal" id="inquiry">
          <div className="section__head">
            <span className="num">04 /</span>
            <span className="title">Impulsa tu negocio</span>
          </div>
          
          <div className="phil">
            <div className="phil__lead">
              Cuéntanos sobre tu negocio e <em>ideas</em>. Encontremos la forma de impulsar tus flujos de trabajo.
            </div>
            <div className="phil__body">
              <p>
                Identificar cuellos de botella y procesos manuales es el primer paso. 
                Sistematizar y automatizar esos procesos es nuestra especialidad.
              </p>
              <button 
                className="btn btn-primary mt-6"
                onClick={() => setShowInquiryModal(true)}
                onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}
              >
                Comenzar <ExternalLink size={16} />
              </button>
            </div>
          </div>
        </section>

        {/* PROJECTS SECTION (NEW) */}
        <section className="wrap reveal" id="projects">
          <div className="section__head">
            <span className="num">05 /</span>
            <span className="title">Proyectos destacados</span>
          </div>
          <h2 className="kicker">Modelos de <em>arquitectura</em> en acción.</h2>
          
          <div className="projects-grid">
            {projects.map(proj => (
              <div className="project-card" key={proj.id} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
                <h3>{proj.title}</h3>
                <p>{proj.desc}</p>
                <div className="project-tags">
                  {proj.tags.map((tag: string) => (
                    <span className="project-tag" key={tag}>{tag}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* PROFESSIONALS DIRECTORY SECTION (NEW) */}
        <section className="wrap reveal" id="directory">
          <div className="section__head">
            <span className="num">06 /</span>
            <span className="title">Directorio de profesionales</span>
          </div>
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-6">
            <h2 className="kicker text-[2rem] sm:text-[3rem] mb-0 max-w-2xl">
              Conecta con talento <em>técnico</em>.
            </h2>
            
            {user ? (
              <button 
                className="btn btn-secondary shrink-0"
                onClick={() => setShowProfessionalModal(true)}
                onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}
              >
                <Plus size={16} /> Mi Perfil Profesional
              </button>
            ) : (
              <div className="text-sm text-[var(--muted)] font-mono">
                Loguéate para añadir tu perfil.
              </div>
            )}
          </div>
          
          <div className="prof-grid">
            {professionals.length === 0 ? (
              <p className="text-[var(--muted)] col-span-full">Aún no hay perfiles profesionales registrados.</p>
            ) : (
              professionals.map(prof => (
                <div className="prof-card" key={prof.id} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
                  <h3>{prof.name}</h3>
                  <div className="prof-title">{prof.title}</div>
                  <p>{prof.bio}</p>
                  
                  {prof.skills && prof.skills.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {prof.skills.map((s: string) => (
                        <span key={s} className="text-xs font-mono text-[var(--cream-soft)] bg-[rgba(255,255,255,0.05)] px-2 py-1">{s}</span>
                      ))}
                    </div>
                  )}

                  <div className="prof-contact border-t border-[var(--line-strong)] pt-4 mt-4">
                    {prof.contactEmail && (
                      <a href={`mailto:${prof.contactEmail}`}>
                        <Mail size={14} /> Correo Electrónico
                      </a>
                    )}
                    {prof.linkedin && (
                      <a href={prof.linkedin} target="_blank" rel="noopener noreferrer">
                        <ExternalLink size={14} /> LinkedIn
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* DEFAULT CONTACT SECTION */}
        <section className="wrap reveal">
          <div className="section__head">
            <span className="num">07 /</span>
            <span className="title">Contacto · canales directos</span>
          </div>
          <h2 className="kicker">¿Listo para <em>sistematizar</em> lo que hoy es manual?</h2>
          
          <div className="contact-grid">
            <a className="ccard" href="https://wa.me/524431014385?text=Hola%20David%2C%20me%20interesa%20Logidma" target="_blank" rel="noopener noreferrer" onMouseMove={handleCellMouseMove} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
              <div className="ccard__icon">
                <Phone size={20} />
              </div>
              <div className="ccard__label">WhatsApp · chat directo</div>
              <div className="ccard__value">+52 443 101 4385</div>
              <div className="ccard__cta">Iniciar conversación</div>
            </a>
            
            <a className="ccard" href="mailto:contacto@logidma.com?subject=Consulta%20Logidma" onMouseMove={handleCellMouseMove} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
              <div className="ccard__icon">
                <Mail size={20} />
              </div>
              <div className="ccard__label">Correo electrónico</div>
              <div className="ccard__value">contacto@logidma.com</div>
              <div className="ccard__cta">Redactar correo</div>
            </a>
          </div>
        </section>

      </main>

      <footer>
        <div className="foot__brand" onClick={() => window.scrollTo({top:0,behavior:'smooth'})}>
          <img src="https://github.com/DavisMtz/logidma-assets/blob/main/Logidma%20logo.png?raw=true" alt="Logidma" />
          <span>Logidma</span>
        </div>
        <div className="foot__meta">
          © 2026 · DAVID MARTÍNEZ ARREDONDO · <span>LA LÓGICA, SISTEMATIZADA</span>
        </div>
      </footer>

      {/* MODALS */}
      {/* Inquiry Modal */}
      <div className={`modal-overlay ${showInquiryModal ? 'open' : ''}`}>
        <div className="modal-content">
          <button className="modal-close" onClick={() => setShowInquiryModal(false)}><X size={24} /></button>
          <h2 className="kicker text-3xl mb-8">Cuéntanos tu <em>idea</em>.</h2>
          
          {inqMsg.text && (
            <div className={`flash-message ${inqMsg.isError ? 'flash-error' : ''}`}>
              {inqMsg.text}
            </div>
          )}

          <form onSubmit={submitInquiry}>
            <div className="form-group">
              <label className="form-label">Nombre Completo</label>
              <input type="text" className="form-input" required 
                value={inqForm.name} onChange={e => setInqForm({...inqForm, name: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Correo Electrónico</label>
              <input type="email" className="form-input" required 
                value={inqForm.email} onChange={e => setInqForm({...inqForm, email: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Empresa / Negocio (Opcional)</label>
              <input type="text" className="form-input" 
                value={inqForm.businessName} onChange={e => setInqForm({...inqForm, businessName: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Flujos de Trabajo / Ideas a Mejorar</label>
              <textarea className="form-textarea" required 
                value={inqForm.idea} onChange={e => setInqForm({...inqForm, idea: e.target.value})} 
                placeholder="Describe los procesos que deseas sistematizar o tu visión actual..."></textarea>
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={inqSaving}>
               {inqSaving ? 'Enviando...' : 'Enviar Consulta'}
            </button>
          </form>
        </div>
      </div>

      {/* Professional Profile Modal */}
      <div className={`modal-overlay ${showProfessionalModal ? 'open' : ''}`}>
        <div className="modal-content">
          <button className="modal-close" onClick={() => setShowProfessionalModal(false)}><X size={24} /></button>
          <h2 className="kicker text-3xl mb-8">Tu Perfil <em>Profesional</em>.</h2>
          
          {profMsg.text && (
            <div className={`flash-message ${profMsg.isError ? 'flash-error' : ''}`}>
              {profMsg.text}
            </div>
          )}

          <form onSubmit={submitProfessional}>
            <div className="form-group">
              <label className="form-label">Nombre para Mostrar</label>
              <input type="text" className="form-input" required maxLength={100}
                value={profForm.name} onChange={e => setProfForm({...profForm, name: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Título Especialidad (ej. Ingeniero de Software)</label>
              <input type="text" className="form-input" required maxLength={150}
                value={profForm.title} onChange={e => setProfForm({...profForm, title: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Biografía Breve</label>
              <textarea className="form-textarea" maxLength={2000}
                value={profForm.bio} onChange={e => setProfForm({...profForm, bio: e.target.value})}></textarea>
            </div>
            <div className="form-group">
              <label className="form-label">Habilidades (separadas por coma)</label>
              <input type="text" className="form-input" placeholder="React, Firebase, Automatización..."
                value={profForm.skills} onChange={e => setProfForm({...profForm, skills: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Email de Contacto Público</label>
              <input type="email" className="form-input" 
                value={profForm.contactEmail} onChange={e => setProfForm({...profForm, contactEmail: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">LinkedIn (URL)</label>
              <input type="url" className="form-input" 
                value={profForm.linkedin} onChange={e => setProfForm({...profForm, linkedin: e.target.value})} />
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={profSaving}>
               {profSaving ? 'Guardando...' : 'Guardar Perfil'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
