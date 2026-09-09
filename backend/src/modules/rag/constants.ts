export const RAG_SETTINGS_DOC = 'rag'
export const RAG_SETTINGS_COLLECTION = 'global_settings'
export const RAG_CHUNKS_COLLECTION = 'ragChunks'
export const RAG_INDEX_STATE_COLLECTION = 'ragIndexState'

/** Piloto: carpeta raíz Sistemas en Drive. */
export const RAG_PILOT_DRIVE_FOLDER_ID = '188-zgNhMIfeUjAI8GracINlItBbFwoUb'
export const RAG_PILOT_GOVERNING_AREA_ID = 'r7QVKsrSiqDWC8DrXCac'
export const RAG_PILOT_LABEL = 'Sistemas'

/** Modelo Vertex vigente (los sufijos -001/-002 de 1.5/2.0 ya no existen en la API). */
export const RAG_GENERATION_MODEL = 'gemini-2.5-flash'

/** Área de Cumplimiento (ex UIF) — exclusión regulatoria total. */
export const RAG_DEFAULT_EXCLUDED_GOVERNING_AREA_ID = 'OWWnpfsRRx0XQ6FCqlOa'

export const RAG_DEFAULT_REGULATORY_MESSAGE =
  'Esta función no está disponible para documentos de Cumplimiento por motivos regulatorios: la información no puede procesarse fuera del país.'

export const RAG_CHUNK_CHARS = 2048
export const RAG_CHUNK_OVERLAP_CHARS = 200
export const RAG_EMBEDDING_DIMS = 768
export const RAG_QUERY_MEMORY_MIB = 512

export const RAG_REGULATORY_ERROR_CODE = 'RAG_REGULATORY_AREA_EXCLUDED'

export const ASSISTANT_INTERACTIONS_COLLECTION = 'assistantInteractions'
export const ASSISTANT_CORRECTIONS_COLLECTION = 'assistantCorrections'
export const ASSISTANT_CORRECTION_SIMILARITY_THRESHOLD = 0.65
export const ASSISTANT_CORRECTION_MAX_MATCHES = 2
