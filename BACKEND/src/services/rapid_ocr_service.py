"""Local OCR via RapidOCR (ONNX Runtime) — no PyTorch, no GPU, no external server."""

import logging
import os
import time
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# RapidOCR's bundled default (ch_PP-OCRv4_rec_infer.onnx) is trained mostly on
# Chinese text and drops spaces between English words. This English-only model
# fixes that at the source instead of trying to reconstruct spacing after the
# fact (RapidOCR's per-character boxes come from CTC decode columns, not real
# pixel positions, so a gap-based heuristic fix broke words apart unpredictably).
_REC_MODEL_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "ocr_models", "en_PP-OCRv3_rec_infer.onnx"
)

# Cap the long edge of any input image before OCR. A raw phone photo can be
# 3000-4000px, which makes RapidOCR both slow (more text regions to detect +
# recognize) and memory-hungry (large intermediate arrays) — enough to time
# out or OOM-kill the worker on a small hosting instance. 2000px keeps label
# text comfortably legible while cutting both cost dramatically.
_MAX_SIDE = 2000


def _try_import_pdf2image():
    try:
        from pdf2image import convert_from_path
        return convert_from_path
    except ImportError:
        return None


class RapidOCRService:
    def __init__(self):
        from rapidocr_onnxruntime import RapidOCR

        logger.info("Loading RapidOCR models...")
        t0 = time.monotonic()
        engine_kwargs = {}
        if os.path.isfile(_REC_MODEL_PATH):
            engine_kwargs["rec_model_path"] = _REC_MODEL_PATH
        else:
            logger.warning(
                "English recognition model not found at %s — falling back to "
                "RapidOCR's bundled default, which drops spaces between "
                "English words.",
                _REC_MODEL_PATH,
            )
        self._engine = RapidOCR(**engine_kwargs)
        logger.info("RapidOCR models ready in %.1fs", time.monotonic() - t0)

        self._convert_pdf = _try_import_pdf2image()

    def process_image(self, image_path: str) -> Dict:
        from PIL import Image

        t0 = time.monotonic()
        image = Image.open(image_path).convert("RGB")
        text = self._run_ocr(image)
        return {
            "extracted_text": text,
            "processing_time": round(time.monotonic() - t0, 3),
            "model_name": "rapidocr",
            "ocr_engine": "rapidocr",
        }

    def process_pdf(self, pdf_path: str) -> Dict:
        if self._convert_pdf is None:
            raise RuntimeError("pdf2image is not installed — cannot process PDFs.")

        t0 = time.monotonic()
        poppler_path = self._find_poppler_path()
        convert_kwargs: Dict = {"dpi": 200}
        if poppler_path:
            convert_kwargs["poppler_path"] = poppler_path

        logger.info("Converting PDF to images: %s", pdf_path)
        pages = self._convert_pdf(pdf_path, **convert_kwargs)

        if not pages:
            return {
                "extracted_text": "",
                "processing_time": round(time.monotonic() - t0, 3),
                "model_name": "rapidocr",
                "ocr_engine": "rapidocr",
                "pages_processed": 0,
            }

        pages = [p.convert("RGB") for p in pages]
        logger.info("Running RapidOCR on %d page(s)", len(pages))
        page_texts = [self._run_ocr(page) for page in pages]

        combined = "\n\n--- Page Break ---\n\n".join(t for t in page_texts if t)
        return {
            "extracted_text": combined,
            "processing_time": round(time.monotonic() - t0, 3),
            "model_name": "rapidocr",
            "ocr_engine": "rapidocr",
            "pages_processed": len(pages),
        }

    def _run_ocr(self, image) -> str:
        import cv2
        import numpy as np

        image = self._downscale(image)
        bgr = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        result, _ = self._engine(bgr)
        if not result:
            return ""
        lines = [entry[1].strip() for entry in result if entry[1] and entry[1].strip()]
        return "\n".join(lines)

    @staticmethod
    def _downscale(image):
        from PIL import Image

        longest = max(image.size)
        if longest <= _MAX_SIDE:
            return image
        scale = _MAX_SIDE / longest
        new_size = (round(image.width * scale), round(image.height * scale))
        logger.info("Downscaling image from %s to %s for OCR", image.size, new_size)
        return image.resize(new_size, Image.LANCZOS)

    @staticmethod
    def _find_poppler_path() -> Optional[str]:
        if os.name != "nt":
            return None
        candidates = [
            r"C:\Program Files\poppler\Library\bin",
            r"C:\Program Files\poppler\bin",
            r"C:\Program Files (x86)\poppler\bin",
            r"C:\poppler\bin",
        ]
        for path in candidates:
            if os.path.isdir(path):
                return path
        return None


# Shared singleton — ocr_routes and comparison_routes both use this, and
# reloading the models per-request would be far too slow.
_rapid_service: Optional[RapidOCRService] = None


def get_rapid_service() -> RapidOCRService:
    global _rapid_service
    if _rapid_service is None:
        _rapid_service = RapidOCRService()
    return _rapid_service
