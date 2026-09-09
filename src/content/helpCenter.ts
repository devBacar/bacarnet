import type { LucideIcon } from 'lucide-react'
import {
  Bell,
  FolderOpen,
  HelpCircle,
  LayoutDashboard,
  Sparkles,
  UserCircle,
} from 'lucide-react'

export type HelpFaq = {
  id: string
  question: string
  paragraphs: string[]
  bullets?: string[]
  where?: string
}

export type HelpCategory = {
  id: string
  title: string
  description: string
  icon: LucideIcon
  badge?: string
  faqs: HelpFaq[]
}

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: 'archivos',
    title: 'Archivos y documentos',
    description: 'Subir, clasificar, compartir y pedir acceso en la Unidad compartida.',
    icon: FolderOpen,
    faqs: [
      {
        id: 'archivos-que-es',
        question: '¿Qué es "Archivos" y qué guarda ahí?',
        paragraphs: [
          'Archivos es el lugar donde la empresa guarda documentos de trabajo en una Unidad compartida de Google Drive. Cada área (Sistemas, Comercial, RRHH, etc.) tiene sus carpetas; vos ves solo lo que tu cuenta tiene permiso para abrir.',
          'Desde BacarNet podés navegar, subir, clasificar y gestionar permisos sin entrar directamente a drive.google.com.',
        ],
        where: 'Menú superior → Archivos',
      },
      {
        id: 'archivos-subir',
        question: '¿Cómo subo un archivo o creo una carpeta?',
        paragraphs: [
          'Entrá a Archivos, abrí la carpeta donde querés dejar el contenido y usá el botón para subir archivos o crear una carpeta nueva.',
          'Al subir, elegí la clasificación de seguridad (Uso interno, Confidencial o Restringido). Si el archivo es un documento Office (Word, Excel, PowerPoint), la subida puede requerir aprobación de un jefe de área antes de quedar visible para otros.',
        ],
        where: 'Archivos → carpeta destino → Subir / Nueva carpeta',
      },
      {
        id: 'archivos-clasificacion',
        question: '¿Qué significa Uso interno, Confidencial y Restringido?',
        paragraphs: [
          'La clasificación indica qué tan sensible es la información. Elegila al crear o subir; no es lo mismo que los permisos (Lector/Editor), pero ayuda a saber qué nivel de cuidado aplicar.',
        ],
        bullets: [
          'Uso interno: material operativo de la empresa. Compartilo solo con quienes lo necesiten para trabajar.',
          'Confidencial: información sensible (contratos, datos de clientes, finanzas). Acceso más acotado y revisá bien a quién lo compartís.',
          'Restringido: máximo nivel de protección. Solo personal muy limitado; no conviene difundirlo por mail ni chats.',
        ],
      },
      {
        id: 'archivos-pedir-acceso',
        question: 'No veo un archivo: ¿cómo pido acceso?',
        paragraphs: [
          'Si alguien te pasó un enlace de Google Drive y no podés abrirlo, necesitás que te den permiso sobre ese archivo o carpeta.',
          'Desde la vista del documento (cuando BacarNet te lo permite ver parcialmente) o con ayuda de quien te compartió el enlace, podés iniciar una solicitud de acceso. Escribí un motivo claro: tu jefe de área recibirá una notificación en la campanita para aprobar o rechazar.',
        ],
        where: 'Campanita → solicitud pendiente (si sos quien aprueba) · o pedile acceso a quien administra el archivo',
      },
      {
        id: 'archivos-mas-permisos',
        question: 'Ya lo veo como Lector: ¿cómo pido ser Editor o Comentarista?',
        paragraphs: [
          'Abrí el archivo en BacarNet. Si solo tenés lectura, vas a ver la opción de pedir más permisos.',
          'Elegí el rol que necesitás (Comentarista o Editor), explicá para qué lo necesitás y enviá la solicitud. Tu jefe de área la verá en la campanita, igual que una solicitud de acceso nueva.',
        ],
        where: 'Archivos → abrir archivo → Pedir más permisos',
      },
      {
        id: 'archivos-compartir-area',
        question: '¿Cómo comparto un archivo con toda un área?',
        paragraphs: [
          'En el modal de permisos del archivo, activá la opción de compartir con un área entera (por ejemplo, Sistemas o Comercial). Elegí el rol (Lector, Comentarista o Editor) y el motivo.',
          'Así no tenés que agregar persona por persona: todos los miembros de esa área con acceso a la Unidad compartida podrán ver el archivo según el rol que hayas elegido.',
        ],
        where: 'Archivos → menú del archivo → Permisos / Compartir → Compartir con área',
      },
      {
        id: 'archivos-office-aprobacion',
        question: 'Subí un Word/Excel/PDF "de oficina": ¿por qué pide aprobación?',
        paragraphs: [
          'Los documentos Office y PDF pasan por una revisión antes de publicarse en la carpeta definitiva. Así un jefe de área puede verificar que el archivo va al lugar correcto y con la clasificación adecuada.',
          'Hasta que no se apruebe, el archivo queda en espera. Vos recibirás aviso cuando se resuelva la solicitud.',
        ],
        where: 'Campanita (para quien aprueba) · Archivos tras la aprobación',
      },
      {
        id: 'archivos-grandes',
        question: '¿Qué pasa si el archivo es muy grande o un ZIP/ISO?',
        paragraphs: [
          'Archivos pesados o comprimidos (.zip, .iso, .7z, .rar) pueden tardar un poco más en subir. BacarNet los procesa en segundo plano: dejá la pestaña abierta hasta que termine.',
          'Si supera el límite permitido, la app te avisará antes de intentar subirlo. En ese caso, consultá con Sistemas si hace falta otra vía.',
        ],
      },
    ],
  },
  {
    id: 'tableros',
    title: 'Tableros',
    description: 'Paneles interactivos de consulta publicados por la empresa.',
    icon: LayoutDashboard,
    faqs: [
      {
        id: 'tableros-que-es',
        question: '¿Qué es un tablero?',
        paragraphs: [
          'Un tablero es un panel web de consulta (gráficos, tablas, indicadores) armado para un tema concreto — por ejemplo, seguimiento operativo o reportes internos.',
          'Cada tablero vive en su propia carpeta con un archivo principal; BacarNet te muestra la lista de tableros a los que tenés acceso.',
        ],
      },
      {
        id: 'tableros-como-entrar',
        question: '¿Cómo entro a uno?',
        paragraphs: [
          'Andá a Tableros en el menú superior, elegí el que necesitás y hacé clic para abrirlo. Se abre en la misma intranet, en pantalla completa si el tablero lo requiere.',
        ],
        where: 'Menú superior → Tableros → elegir tablero',
      },
      {
        id: 'tableros-no-aparece',
        question: 'No me aparece ninguno: ¿qué hago?',
        paragraphs: [
          'Los tableros se asignan por permiso: si la lista está vacía, todavía no tenés ninguno habilitado para tu usuario.',
          'Pedí acceso a Sistemas o a quien administre el tablero que necesitás, indicando para qué lo vas a usar.',
        ],
      },
      {
        id: 'tableros-quien-asigna',
        question: '¿Quién decide quién ve cada tablero?',
        paragraphs: [
          'Sistemas y los administradores del tablero configuran qué usuarios o áreas pueden abrirlo. No se heredan automáticamente todos los permisos de Archivos: cada tablero es independiente.',
        ],
      },
    ],
  },
  {
    id: 'notificaciones',
    title: 'Notificaciones y aprobaciones',
    description: 'Campanita, avisos informativos y solicitudes que requieren tu respuesta.',
    icon: Bell,
    faqs: [
      {
        id: 'notif-campanita',
        question: '¿Para qué sirve la campanita?',
        paragraphs: [
          'Concentrá ahí los avisos de BacarNet: accesos aprobados, cambios en archivos de tu área, solicitudes pendientes y novedades importantes.',
          'El numerito rojo indica cuántos avisos no leíste. Podés marcar todos como leídos cuando termines de revisar.',
        ],
        where: 'Icono de campana en la barra superior (junto al modo claro/oscuro)',
      },
      {
        id: 'notif-tipos',
        question: '¿Qué es un aviso "informativo" vs uno que pide mi acción?',
        paragraphs: [
          'Los informativos solo te cuentan algo (por ejemplo, que te dieron acceso a un archivo). Los de acción requieren que apruebes o rechaces una solicitud — acceso a un archivo o subida de un documento Office.',
          'Los de acción muestran campos para escribir el motivo de tu decisión antes de confirmar.',
        ],
      },
      {
        id: 'notif-acceso-archivo',
        question: 'Me pidieron aprobar acceso a un archivo: ¿qué reviso?',
        paragraphs: [
          'Leé quién lo pide, qué archivo es y el motivo que escribió. Si es correcto otorgar acceso, aprobá con un motivo breve; si no corresponde, rechazá explicando por qué.',
          'La persona recibirá aviso del resultado en su campanita.',
        ],
        where: 'Campanita → notificación de solicitud de acceso → Aprobar / Rechazar',
      },
      {
        id: 'notif-office-subida',
        question: 'Me pidieron aprobar una subida de documento Office: ¿qué hago?',
        paragraphs: [
          'Alguien de tu área quiere publicar un Word, Excel, PowerPoint o PDF en Archivos. Antes de aprobar, conviene ver qué subió.',
          'En la notificación, el nombre del archivo aparece como enlace: hacé clic ahí para abrir la vista previa y revisar el contenido en BacarNet. Recién cuando estés conforme, volvé a la campanita, escribí un motivo y usá "Aprobar subida" o "Rechazar".',
          'Si cerraste la notificación, podés volver a abrir la previsualización desde el mismo enlace en el texto del aviso mientras siga pendiente.',
        ],
        where: 'Campanita → clic en el nombre del archivo (vista previa) → Aprobar subida / Rechazar',
      },
      {
        id: 'notif-ya-respondi',
        question: '¿Cómo sé si ya respondí a una solicitud?',
        paragraphs: [
          'Después de aprobar o rechazar, la notificación muestra un mensaje de cierre ("Esta solicitud ya fue aceptada" o similar) y ya no podés volver a accionar sobre la misma.',
          'Si otro aprobador la resolvió antes, también verás el estado actualizado al abrir la campanita.',
        ],
      },
      {
        id: 'notif-ignorar',
        question: '¿Puedo ignorar la campanita?',
        paragraphs: [
          'Podés, pero las solicitudes de acción quedan pendientes hasta que alguien con permiso las resuelva. Si sos jefe de área, tu equipo puede quedar sin acceso o sin poder publicar archivos hasta que respondas.',
          'Los avisos informativos no bloquean nada; los de acción sí pueden frenar el trabajo de otros.',
        ],
      },
    ],
  },
  {
    id: 'cuenta',
    title: 'Tu cuenta y la pantalla de inicio',
    description: 'Personalización, áreas, departamento y accesos rápidos.',
    icon: UserCircle,
    faqs: [
      {
        id: 'cuenta-tema',
        question: '¿Cómo cambio entre modo claro y oscuro?',
        paragraphs: [
          'Usá el botón con icono de luna o sol en la barra superior. El cambio se guarda en este navegador para la próxima vez que entres.',
        ],
        where: 'Barra superior → icono luna / sol (junto a la campanita)',
      },
      {
        id: 'cuenta-widgets',
        question: '¿Cómo elijo qué widgets ver en el inicio?',
        paragraphs: [
          'En la tarjeta de bienvenida del inicio hay un engranaje. Desde ahí activás o desactivás widgets como el clima en Córdoba y las cotizaciones del dólar.',
        ],
        where: 'Inicio → tarjeta de bienvenida → icono engranaje → Widgets en la home',
      },
      {
        id: 'cuenta-herramientas',
        question: '¿Qué son "Mis herramientas" en el inicio?',
        paragraphs: [
          'Son accesos directos a aplicaciones internas o enlaces útiles que anclás desde Accesos directos con la chincheta.',
          'Si no anclaste ninguna, BacarNet muestra sugerencias por defecto. Anclá las que uses todos los días para tenerlas a mano al entrar.',
        ],
        where: 'Accesos directos → chincheta en cada app → se reflejan en Inicio',
      },
      {
        id: 'cuenta-area-vs-depto',
        question: 'Área de pertenencia vs departamento: ¿cuál es la diferencia?',
        paragraphs: [
          'El departamento es una etiqueta organizativa (aparece en el directorio de contactos: Comercial, RRHH, etc.). Sirve para ubicar personas, no define permisos en Archivos.',
          'Las áreas de pertenencia son las áreas de BacarNet a las que estás vinculado para gobernanza de documentos (Sistemas, Operaciones…). Definen quién puede aprobar solicitudes, heredar accesos por área y similares. Solo un administrador puede cambiarlas.',
        ],
      },
      {
        id: 'cuenta-quien-cambia',
        question: '¿Quién puede cambiar mi área o permisos especiales?',
        paragraphs: [
          'Las áreas de pertenencia y los permisos administrativos los gestionan los administradores de BacarNet (Sistemas / super_admin). Si creés que deberías estar en otra área, hablá con tu jefe y ellos lo gestionan.',
          'Los permisos sobre un archivo puntual los puede otorgar quien ya administra ese archivo o un jefe del área gobernante, según las reglas de la intranet.',
        ],
      },
      {
        id: 'cuenta-contactos',
        question: '¿Dónde veo Contactos y para qué sirve?',
        paragraphs: [
          'Contactos es el directorio interno: buscá compañeros por nombre, puesto o departamento y encontrá mails o datos publicados.',
          'Si no ves el ítem en el menú, el módulo puede estar desactivado para tu perfil; en ese caso consultá con Sistemas.',
        ],
        where: 'Menú superior → Contactos',
      },
    ],
  },
  {
    id: 'asistente',
    title: 'Asistente de Sistemas (piloto)',
    description: 'Consultas en lenguaje natural sobre documentación del área Sistemas.',
    icon: Sparkles,
    badge: 'Piloto',
    faqs: [
      {
        id: 'asistente-que-hace',
        question: '¿Qué hace el asistente?',
        paragraphs: [
          'Respondé preguntas sobre manuales, guías y documentos del área Sistemas que ya están indexados. Por ejemplo: "¿Cómo instalo el driver ASR?" o "¿Qué dice la guía de Smart PSS?".',
          'También puede preparar borradores de correo o eventos de calendario (solo cuentas @bacarsa.com.ar). Nada se envía ni se crea hasta que revises el borrador y confirmes en el chat.',
          'Te devuelve una respuesta resumida y enlaces a los archivos fuente. Solo usa documentos a los que vos tenés permiso real en Drive.',
        ],
      },
      {
        id: 'asistente-quien',
        question: '¿Quién puede usarlo hoy?',
        paragraphs: [
          'Está en fase piloto. Sistemas habilita el acceso desde Administración → Usuarios, con el permiso «Asistente BacarNet» (igual que Ver archivos o Ver contactos). Los super administradores siempre tienen acceso.',
          'Si entrás y no tenés acceso, la app te lo indicará; pedile a Sistemas que active el permiso en tu usuario.',
        ],
        where: 'Botón flotante del asistente en Archivos, Inicio, Tableros y Ayuda (antes /recursos/asistente-sistemas redirige al mismo chat)',
      },
      {
        id: 'asistente-limites',
        question: '¿Qué documentos puede consultar (y cuáles no)?',
        paragraphs: [
          'Solo documentos del área Sistemas indexados en el piloto y solo si tu usuario tiene permiso de lectura en Drive.',
        ],
        bullets: [
          'No incluye documentos clasificados como Restringido ni material del área Cumplimiento (excluidos por política regulatoria).',
          'No reemplaza Drive: si no tenés acceso al archivo, el asistente tampoco puede mostrártelo.',
        ],
      },
      {
        id: 'asistente-piloto',
        question: 'Está en prueba: ¿qué conviene preguntarle?',
        paragraphs: [
          'Usalo con preguntas reales de tu trabajo — procedimientos, instalaciones, configuraciones documentadas en Sistemas. Evitá tratarlo como un chat general: no tiene información de otras áreas ni de internet.',
          'Si la respuesta no cierra o falta un documento, contale a Sistemas: eso ayuda a mejorar el piloto antes de abrirlo a más gente.',
        ],
      },
    ],
  },
]

export const HELP_CONTACT_EMAIL = 'sistemas.ti@bacarsa.com.ar'

export const HelpPageIcon = HelpCircle
