#!/usr/bin/env python3
"""
Docling HybridChunker implementation for vault notes.
"""

from docling.document_converter import DocumentConverter
from docling.chunking import HybridChunker
from transformers import AutoTokenizer
import sys
import json

def chunk_markdown(file_path: str, max_tokens: int = 512):
    """
    Chunk markdown file using Docling HybridChunker.
    Returns array of contextualized chunks.
    
    Args:
        file_path: Path to markdown file
        max_tokens: Maximum tokens per chunk
        
    Returns:
        List of chunks with contextualized content
    """
    from pathlib import Path
    import os
    
    # Validate file exists and is readable
    file_path_obj = Path(file_path).resolve()
    if not file_path_obj.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    if not file_path_obj.is_file():
        raise ValueError(f"Not a file: {file_path}")
    
    from docling.datamodel.base_models import InputFormat
    import tempfile
    import shutil
    
    # First attempt: default converter (supports all formats)
    try:
        converter = DocumentConverter(
            allowed_formats=[
                InputFormat.MD,
                InputFormat.IMAGE,
                InputFormat.PDF,
                InputFormat.DOCX
            ]
        )
        result = converter.convert(str(file_path_obj))
        
    except Exception as e:
        error_msg = str(e).lower()
        file_ext = file_path_obj.suffix.lower()
        
        # Docling bug: files starting with "BM" trigger BMP image detection
        # Workaround: prepend "---\n" to change first bytes, use temp file
        if ('image' in error_msg or 'truncated' in error_msg or 'not valid' in error_msg) and file_ext in ['.md', '.markdown']:
            print(f"⚠️  Retrying {file_path_obj.name} with BMP workaround", file=sys.stderr)
            
            try:
                # Create temp file with "---\n" prepended
                with tempfile.NamedTemporaryFile(mode='w', suffix='.md', delete=False) as tmp:
                    tmp.write("---\n")
                    with open(file_path_obj, 'r') as orig:
                        tmp.write(orig.read())
                    tmp_path = tmp.name
                
                try:
                    converter = DocumentConverter(allowed_formats=[InputFormat.MD])
                    result = converter.convert(tmp_path)
                    
                    # Fix document metadata to reference original file, not temp file
                    print(f"🔧 Fixing metadata - before: name={result.document.name}", file=sys.stderr)
                    result.document.name = file_path_obj.name
                    print(f"🔧 Fixing metadata - after: name={result.document.name}", file=sys.stderr)
                    
                    if hasattr(result.document, 'file_path'):
                        print(f"🔧 Fixing metadata - before: file_path={result.document.file_path}", file=sys.stderr)
                        result.document.file_path = str(file_path_obj)
                        print(f"🔧 Fixing metadata - after: file_path={result.document.file_path}", file=sys.stderr)
                    
                    print(f"✅ BMP workaround succeeded for {file_path_obj.name}", file=sys.stderr)
                finally:
                    # Clean up temp file
                    Path(tmp_path).unlink(missing_ok=True)
            except Exception as workaround_error:
                print(f"❌ BMP workaround failed for {file_path_obj.name}: {workaround_error}", file=sys.stderr)
                raise
        else:
            # Re-raise if not our specific error
            raise
    
    # Initialize chunker with Nomic's tokenizer
    tokenizer = AutoTokenizer.from_pretrained("nomic-ai/nomic-embed-text-v1", trust_remote_code=True)
    chunker = HybridChunker(
        tokenizer=tokenizer,
        max_tokens=max_tokens,
        merge_peers=True
    )
    
    # Chunk document
    chunk_iter = chunker.chunk(dl_doc=result.document)
    chunks = []
    
    for i, chunk in enumerate(chunk_iter):
        # Get contextualized text (includes heading hierarchy)
        contextualized = chunker.contextualize(chunk=chunk)
        chunks.append({
            'index': i,
            'content': contextualized.strip(),
            'token_count': len(tokenizer.encode(contextualized))
        })
    
    return chunks

def chunk_image(file_path: str, max_tokens: int = 512):
    """
    OCR and chunk an image file using Docling.
    Returns array of contextualized chunks from image OCR text.
    
    Args:
        file_path: Path to image file (.jpg, .png, etc.)
        max_tokens: Maximum tokens per chunk
        
    Returns:
        List of chunks with OCR text
    """
    from pathlib import Path
    from docling.datamodel.base_models import InputFormat
    from docling.document_converter import ImageFormatOption
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    
    # Validate file exists
    file_path_obj = Path(file_path).resolve()
    if not file_path_obj.exists():
        raise FileNotFoundError(f"Image not found: {file_path}")
    if not file_path_obj.is_file():
        raise ValueError(f"Not a file: {file_path}")
    
    # Configure OCR with enhanced settings
    # Using EasyOCR (default) with explicit configuration for better accuracy
    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = True  # Explicit OCR enable
    pipeline_options.images_scale = 2.0  # 2x upscale
    pipeline_options.generate_picture_images = True
    
    # Convert image with enhanced OCR settings
    converter = DocumentConverter(
        format_options={
            InputFormat.IMAGE: ImageFormatOption(
                pipeline_options=pipeline_options
            )
        }
    )
    result = converter.convert(str(file_path_obj))
    
    # Initialize chunker with Nomic's tokenizer
    tokenizer = AutoTokenizer.from_pretrained("nomic-ai/nomic-embed-text-v1", trust_remote_code=True)
    chunker = HybridChunker(
        tokenizer=tokenizer,
        max_tokens=max_tokens,
        merge_peers=True
    )
    
    # Chunk OCR'd document
    chunk_iter = chunker.chunk(dl_doc=result.document)
    chunks = []
    
    for i, chunk in enumerate(chunk_iter):
        # Get contextualized text (includes heading hierarchy)
        contextualized = chunker.contextualize(chunk=chunk)
        chunks.append({
            'index': i,
            'content': contextualized.strip(),
            'token_count': len(tokenizer.encode(contextualized))
        })
    
    return chunks

if __name__ == '__main__':
    # CLI interface for TypeScript to call
    if len(sys.argv) < 2:
        print(json.dumps({"error": "File path required"}))
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == 'chunk-markdown':
        if len(sys.argv) < 3:
            print(json.dumps({"error": "File path required for chunk-markdown"}))
            sys.exit(1)
        file_path = sys.argv[2]
        max_tokens = int(sys.argv[3]) if len(sys.argv) > 3 else 512
        
        try:
            chunks = chunk_markdown(file_path, max_tokens)
            print(json.dumps(chunks))
        except Exception as e:
            print(json.dumps({"error": str(e)}), file=sys.stderr)
            sys.exit(1)
    
    elif command == 'chunk-image':
        if len(sys.argv) < 3:
            print(json.dumps({"error": "File path required for chunk-image"}))
            sys.exit(1)
        file_path = sys.argv[2]
        max_tokens = int(sys.argv[3]) if len(sys.argv) > 3 else 512
        
        try:
            chunks = chunk_image(file_path, max_tokens)
            print(json.dumps(chunks))
        except Exception as e:
            print(json.dumps({"error": str(e)}), file=sys.stderr)
            sys.exit(1)
    
    else:
        # Backward compatibility: if first arg is not a command, treat as file path
        file_path = sys.argv[1]
        max_tokens = int(sys.argv[2]) if len(sys.argv) > 2 else 512
        
        try:
            chunks = chunk_markdown(file_path, max_tokens)
            print(json.dumps(chunks))
        except Exception as e:
            print(json.dumps({"error": str(e)}), file=sys.stderr)
            sys.exit(1)
