import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { queryKeys } from '../../lib/queryKeys'
import {
  createDriveFile,
  trashDriveFile,
  renameDriveFile,
  type DriveFileDto,
  type ListDriveFilesResult,
} from '../../services/driveApi'

function patchFolderFiles(
  current: ListDriveFilesResult | undefined,
  updater: (files: DriveFileDto[]) => DriveFileDto[],
): ListDriveFilesResult | undefined {
  if (!current) return current
  return { ...current, files: updater(current.files) }
}

export function useDriveFolderMutations(uid: string | undefined, folderId: string | null) {
  const queryClient = useQueryClient()
  const queryKey = queryKeys.drive.files(uid, folderId)

  const trashMutation = useMutation({
    mutationFn: async (input: { fileId: string; reason: string }) => {
      await trashDriveFile(input.fileId, input.reason)
      return input.fileId
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<ListDriveFilesResult>(queryKey)
      queryClient.setQueryData<ListDriveFilesResult>(queryKey, (current) =>
        patchFolderFiles(current, (files) => files.filter((file) => file.id !== input.fileId)),
      )
      return { previous }
    },
    onError: (err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous)
      }
      toast.error(
        err instanceof Error
          ? `No se pudo eliminar: ${err.message}`
          : 'No se pudo enviar a la papelera. El listado fue restaurado.',
      )
    },
    onSuccess: () => {
      toast.success('Elemento enviado a la papelera')
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey, refetchType: 'active' })
    },
  })

  const renameMutation = useMutation({
    mutationFn: async (input: { fileId: string; name: string }) => {
      await renameDriveFile(input.fileId, input.name)
      return input
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<ListDriveFilesResult>(queryKey)
      queryClient.setQueryData<ListDriveFilesResult>(queryKey, (current) =>
        patchFolderFiles(current, (files) =>
          files.map((file) =>
            file.id === input.fileId ? { ...file, name: input.name.trim() } : file,
          ),
        ),
      )
      return { previous }
    },
    onError: (err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous)
      }
      toast.error(
        err instanceof Error
          ? `No se pudo renombrar: ${err.message}`
          : 'No se pudo renombrar. Se revirtió el cambio en pantalla.',
      )
    },
    onSuccess: () => {
      toast.success('Nombre actualizado')
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey, refetchType: 'active' })
    },
  })

  const createMutation = useMutation({
    mutationFn: createDriveFile,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<ListDriveFilesResult>(queryKey)
      const optimisticId = `optimistic-${Date.now()}`
      const optimisticFile: DriveFileDto = {
        id: optimisticId,
        name: input.name.trim(),
        mimeType:
          input.type === 'folder'
            ? 'application/vnd.google-apps.folder'
            : input.type === 'google_sheet'
              ? 'application/vnd.google-apps.spreadsheet'
              : 'application/vnd.google-apps.document',
        parents: input.parentFolderId ? [input.parentFolderId] : [],
        modifiedTime: new Date().toISOString(),
        createdTime: new Date().toISOString(),
        size: null,
        iconLink: null,
        webViewLink: null,
        isFolder: input.type === 'folder',
        capabilities: {
          canTrash: true,
          canEdit: true,
          canRename: true,
          canShare: false,
          canAddChildren: input.type === 'folder',
        },
        classification: input.classification ?? null,
        status: input.type === 'folder' ? null : 'BORRADOR',
        governingAreaId: null,
        governingAreaName: null,
        creator: {
          displayName: null,
          email: null,
          source: 'intranet',
        },
        ownerLabel: 'Creando…',
      }
      queryClient.setQueryData<ListDriveFilesResult>(queryKey, (current) =>
        patchFolderFiles(current, (files) => [...files, optimisticFile]),
      )
      return { previous, optimisticId }
    },
    onSuccess: (created, input, context) => {
      if (context?.optimisticId) {
        queryClient.setQueryData<ListDriveFilesResult>(queryKey, (current) =>
          patchFolderFiles(current, (files) =>
            files.map((file) =>
              file.id === context.optimisticId
                ? {
                    ...file,
                    ...created,
                    id: created.id,
                    isFolder: created.mimeType === 'application/vnd.google-apps.folder',
                    ownerLabel:
                      created.creator?.displayName ??
                      created.creator?.email ??
                      file.ownerLabel === 'Creando…'
                        ? '—'
                        : file.ownerLabel,
                  }
                : file,
            ),
          ),
        )
      }
      toast.success(
        input.type === 'folder' ? 'Carpeta creada en Drive' : 'Archivo creado en Drive',
      )
    },
    onError: (err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous)
      }
      toast.error(
        err instanceof Error
          ? `No se pudo crear: ${err.message}`
          : 'No se pudo crear el elemento. Se revirtió el listado.',
      )
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey, refetchType: 'active' })
    },
  })

  return { trashMutation, renameMutation, createMutation }
}
