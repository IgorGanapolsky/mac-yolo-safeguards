import {
  extractDocumentText,
  getDocumentFormat,
  isSupportedDocumentName,
} from '../utils/documentContentExtractor';
import { File } from 'expo-file-system';
import { extractTextWithInfo, isAvailable as isPdfExtractorAvailable } from 'expo-pdf-text-extract';
import mammoth from 'mammoth';

jest.mock('expo-pdf-text-extract', () => ({
  isAvailable: jest.fn(() => true),
  extractTextWithInfo: jest.fn(),
}));

jest.mock('mammoth', () => ({
  extractRawText: jest.fn(),
}));

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({
    uri,
    text: jest.fn(() => Promise.resolve('hello world')),
    arrayBuffer: jest.fn(() => Promise.resolve(new ArrayBuffer(8))),
  })),
}));

describe('documentContentExtractor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isPdfExtractorAvailable as jest.Mock).mockReturnValue(true);
  });

  it('classifies text, pdf, docx, and unsupported formats', () => {
    expect(getDocumentFormat('notes.md')).toBe('text');
    expect(getDocumentFormat('report.pdf')).toBe('pdf');
    expect(getDocumentFormat('brief.docx')).toBe('docx');
    expect(getDocumentFormat('sheet.xlsx')).toBe('unsupported');
  });

  it('supports common attachable document names', () => {
    expect(isSupportedDocumentName('readme.txt')).toBe(true);
    expect(isSupportedDocumentName('paper.pdf')).toBe(true);
    expect(isSupportedDocumentName('spec.docx')).toBe(true);
    expect(isSupportedDocumentName('archive.zip')).toBe(false);
  });

  it('reads plain text documents from the file URI', async () => {
    const result = await extractDocumentText('file:///tmp/notes.txt', 'notes.txt');
    expect(result).toEqual({ ok: true, text: 'hello world', truncated: false });
    expect(File).toHaveBeenCalledWith('file:///tmp/notes.txt');
  });

  it('extracts PDF text when native extractor succeeds', async () => {
    (extractTextWithInfo as jest.Mock).mockResolvedValueOnce({
      success: true,
      text: 'PDF body',
      pageCount: 2,
      isEncrypted: false,
    });

    const result = await extractDocumentText('file:///tmp/report.pdf', 'report.pdf');
    expect(result).toEqual({ ok: true, text: 'PDF body', truncated: false });
    expect(extractTextWithInfo).toHaveBeenCalledWith('file:///tmp/report.pdf');
  });

  it('returns a friendly error when PDF extraction fails', async () => {
    (extractTextWithInfo as jest.Mock).mockResolvedValueOnce({
      success: false,
      text: '',
      pageCount: 0,
      isEncrypted: true,
      passwordRequired: true,
      errorCode: 'PASSWORD_REQUIRED',
    });

    const result = await extractDocumentText('file:///tmp/locked.pdf', 'locked.pdf');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.userMessage).toMatch(/password/i);
    }
  });

  it('extracts DOCX text via mammoth', async () => {
    (mammoth.extractRawText as jest.Mock).mockResolvedValueOnce({ value: 'Word body' });

    const result = await extractDocumentText('file:///tmp/brief.docx', 'brief.docx');
    expect(result).toEqual({ ok: true, text: 'Word body', truncated: false });
    expect(File).toHaveBeenCalledWith('file:///tmp/brief.docx');
  });
});
