import { exec } from "child_process";
import path from "path";
import fs from "fs";

/**
 * Converts a Word document (.doc or .docx) to a PDF.
 * On Windows, it uses MS Word via PowerShell COM automation.
 * On Linux/Mac, it falls back to headless LibreOffice.
 * 
 * @param inputPath The path to the uploaded temporary file.
 * @param fileExt The extension of the file (doc or docx).
 * @returns The absolute path of the generated PDF.
 */
export async function convertDocToPdf(inputPath: string, fileExt: string): Promise<string> {
  const absoluteInputPath = path.resolve(inputPath);
  const dir = path.dirname(absoluteInputPath);
  const baseName = path.basename(absoluteInputPath);
  const inputWithExt = absoluteInputPath + "." + fileExt;
  
  // Make sure the file exists with the proper extension for MS Word/LibreOffice to open it correctly
  fs.copyFileSync(absoluteInputPath, inputWithExt);
  
  const outputPath = absoluteInputPath + ".pdf";
  const isWindows = process.platform === "win32";

  return new Promise((resolve, reject) => {
    if (isWindows) {
      // Use MS Word COM automation via PowerShell
      // Flatten script to single line with semicolons to run safely from cmd/powershell
      const command = `powershell -ExecutionPolicy Bypass -Command "$word = New-Object -ComObject Word.Application; $word.Visible = $false; $word.DisplayAlerts = 0; try { $doc = $word.Documents.Open('${inputWithExt.replace(/\\/g, '\\\\')}'); $doc.SaveAs('${outputPath.replace(/\\/g, '\\\\')}', 17); $doc.Close(); Write-Output 'Success' } catch { Write-Error $_.Exception.Message } finally { $word.Quit() }"`;

      exec(command, (error, stdout, stderr) => {
        // Clean up temporary file with extension
        try {
          if (fs.existsSync(inputWithExt)) {
            fs.unlinkSync(inputWithExt);
          }
        } catch (cleanupErr) {
          console.error("[Converter] Temporary file cleanup failed:", cleanupErr);
        }

        if (error) {
          console.error("[Converter] Windows Word conversion failed:", error, stderr);
          reject(new Error(`DOC/DOCX to PDF conversion failed: ${error.message}`));
        } else if (stdout.includes("Success")) {
          resolve(outputPath);
        } else {
          reject(new Error(`DOC/DOCX to PDF conversion failed: ${stderr || stdout}`));
        }
      });
    } else {
      // Use LibreOffice headless command on Linux/macOS
      const command = `soffice --headless --convert-to pdf "${inputWithExt}" --outdir "${dir}"`;

      exec(command, (error, stdout, stderr) => {
        // Clean up temporary file with extension
        try {
          if (fs.existsSync(inputWithExt)) {
            fs.unlinkSync(inputWithExt);
          }
        } catch (cleanupErr) {
          console.error("[Converter] Temporary file cleanup failed:", cleanupErr);
        }

        if (error) {
          console.error("[Converter] LibreOffice conversion failed:", error, stderr);
          reject(new Error(`DOC/DOCX to PDF conversion failed: ${error.message}`));
        } else {
          const expectedPdfPath = path.join(dir, baseName + ".pdf");
          if (fs.existsSync(expectedPdfPath)) {
            if (expectedPdfPath !== outputPath) {
              fs.renameSync(expectedPdfPath, outputPath);
            }
            resolve(outputPath);
          } else {
            reject(new Error("Converted PDF file not found after LibreOffice conversion."));
          }
        }
      });
    }
  });
}
