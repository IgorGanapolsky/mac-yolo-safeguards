import { File } from 'expo-file-system';
import { extractTextWithInfo, isAvailable as isPdfExtractorAvailable } from 'expo-pdf-text-extract';
import mammoth from 'mammoth';
import { isTextDocumentName } from './chatAttachments';

export type DocumentFormat = 'text' | 'pdf' | 'docx' | 'unsupported';

export type DocumentExtractionResult =
  | { ok: true; text: string; truncated: boolean }
  | { ok: false; userMessage: string };

const PDF_EXTENSIONS = new Set(['pdf']);
const DOCX_EXTENSIONS = new Set(['docx']);

export function getDocumentFormat(name: string, mimeType?: string): DocumentFormat {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  if (isTextDocumentName(name)) {
    return 'text';
  }
  if (PDF_EXTENSIONS.has(extension) || mimeType === 'application/pdf') {
    return 'pdf';
  }
  if (
    DOCX_EXTENSIONS.has(extension) ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'docx';
  }
  return 'unsupported';
}

export function isSupportedDocumentName(name: string, mimeType?: string): boolean {
  return getDocumentFormat(name, mimeType) !== 'unsupported';
}

async function readPlainTextDocument(uri: string): Promise<string> {
  return new File(uri).text();
}

async function readPdfText(uri: string): Promise<DocumentExtractionResult> {
  if (!isPdfExtractorAvailable()) {
    return {
      ok: false,
      userMessage: 'PDF text extraction is not available in this build. Reinstall the latest Hermes Mobile app.',
    };
  }

  const result = await extractTextWithInfo(uri);
  if (result.success) {
    const text = result.text.trim();
    if (!text) {
      return {
        ok: false,
        userMessage:
          'This PDF has no readable text (it may be scanned images). Try a digital PDF or paste the text manually.',
      };
    }
    return { ok: true, text, truncated: false };
  }

  if (result.passwordRequired || result.errorCode === 'PASSWORD_REQUIRED') {
    return {
      ok: false,
      userMessage: 'Password-protected PDFs are not supported yet. Export an unprotected copy and try again.',
    };
  }

  if (result.errorCode === 'INCORRECT_PASSWORD') {
    return {
      ok: false,
      userMessage: 'Could not unlock this PDF. Export an unprotected copy and try again.',
    };
  }

  return {
    ok: false,
    userMessage: result.error?.trim() || 'Could not read this PDF. Try another file or paste the text manually.',
  };
}

async function readDocxText(uri: string): Promise<DocumentExtractionResult> {
  const buffer = await new File(uri).arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  const text = result.value.trim();
  if (!text) {
    return {
      ok: false,
      userMessage: 'This Word document appears empty. Try another file or paste the text manually.',
    };
  }
  return { ok: true, text, truncated: false };
}

export async function extractDocumentText(
  uri: string,
  name: string,
  mimeType?: string,
): Promise<DocumentExtractionResult> {
  const format = getDocumentFormat(name, mimeType);
  if (format === 'unsupported') {
    return {
      ok: false,
      userMessage:
        'Unsupported file type. Hermes supports .txt, .md, code files, .pdf, and .docx. Save as one of those and try again.',
    };
  }

  try {
    if (format === 'text') {
      const text = (await readPlainTextDocument(uri)).trim();
      if (!text) {
        return { ok: false, userMessage: 'This file is empty.' };
      }
      return { ok: true, text, truncated: false };
    }
    if (format === 'pdf') {
      return readPdfText(uri);
    }
    return readDocxText(uri);
  } catch {
    return {
      ok: false,
      userMessage: 'Could not read this document. Try another file or paste the text manually.',
    };
  }
}
