"""Inspection contract tests, not a substitute for real Poppler/visual QA."""
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("inspect_pdf", Path(__file__).with_name("inspect-pdf.py"))
inspector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inspector)


class InspectPdfContract(unittest.TestCase):
    def run_inspection(self, pages=1, rotation=0, text=""):
        metadata = f"Pages: {pages}\nPage 1 size: 595.304 x 841.89 pts (A4)\nPage 1 rot: {rotation}\n"
        calls = []

        def output(command, limit):
            calls.append((command, limit))
            return metadata if command[0] == "/usr/bin/pdfinfo" else text

        destination = io.BytesIO()
        with patch.object(inspector.os.path, "getsize", return_value=1000), \
                patch.object(inspector, "bounded_output", side_effect=output), \
                patch.object(inspector.sys, "stdout") as stdout:
            stdout.buffer = destination
            inspector.inspect()
        return json.loads(destination.getvalue()), calls

    def test_reading_order_not_physical_rows_or_raw_stream(self):
        # The real two-column fixture's physical row extraction inserted
        # "Excel SQL Python" between "个人" and "独立成果" in this sentence.
        text = "Excel SQL Python\n参与团队讨论，解释清洗步骤与检查范围，不将团队成果归为个人\n独立成果。"
        result, calls = self.run_inspection(text=text)
        self.assertEqual(calls[1], (["/usr/bin/pdftotext", "-enc", "UTF-8", "-nopgbrk", "/work/resume.pdf", "-"], inspector.MAX_TEXT_BYTES))
        self.assertEqual(result["text"], text)  # No repair, reordering or deletion in Python.
        self.assertEqual(result["pageCount"], 1)

    def test_multi_page_does_not_extract_text(self):
        result, calls = self.run_inspection(pages=2)
        self.assertEqual(len(calls), 1)
        self.assertEqual(result["pageCount"], 2)
        self.assertEqual(result["text"], "")

    def test_rotated_page_still_fails_size_contract(self):
        result, _ = self.run_inspection(rotation=90)
        self.assertEqual(result["pages"], [{"width": 0, "height": 0}])

    def test_large_pdf_is_rejected_before_subprocess(self):
        with patch.object(inspector.os.path, "getsize", return_value=20 * 1024 * 1024 + 1), \
                patch.object(inspector, "bounded_output") as output:
            with self.assertRaises(ValueError):
                inspector.inspect()
            output.assert_not_called()


if __name__ == "__main__":
    unittest.main()
