import PDFDocument from "pdfkit";

export interface CertificatePdfInput {
  certificateId: string;
  verificationCode: string;
  candidateName: string;
  candidateRef: string;
  courseName: string;
  courseCode: string;
  trainingCenterName: string;
  issuedAt: Date;
}

export type CertificatePdfGenerator = (
  input: CertificatePdfInput
) => Promise<Buffer>;

export async function generateCertificatePdf(
  input: CertificatePdfInput
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 48,
      info: {
        Title: `SkillPass Certificate - ${input.candidateRef}`,
        Author: "SkillPass",
        CreationDate: input.issuedAt,
        ModDate: input.issuedAt,
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;

    // Outer border
    doc
      .save()
      .lineWidth(3)
      .strokeColor("#1e3a8a")
      .rect(24, 24, pageWidth - 48, pageHeight - 48)
      .stroke();

    // Inner accent border
    doc
      .lineWidth(1)
      .strokeColor("#93c5fd")
      .rect(32, 32, pageWidth - 64, pageHeight - 64)
      .stroke()
      .restore();

    // Header
    doc
      .fillColor("#1e3a8a")
      .font("Helvetica-Bold")
      .fontSize(14)
      .text("SKILLPASS", 0, 72, { align: "center", characterSpacing: 4 });

    doc
      .fillColor("#0f172a")
      .font("Helvetica-Bold")
      .fontSize(30)
      .text("Certificate of Qualification", 0, 102, { align: "center" });

    doc
      .fillColor("#475569")
      .font("Helvetica")
      .fontSize(14)
      .text("This certifies that", 0, 165, { align: "center" });

    // Candidate name and immutable reference
    doc
      .fillColor("#0f172a")
      .font("Helvetica-Bold")
      .fontSize(26)
      .text(input.candidateName, 60, 198, {
        width: pageWidth - 120,
        align: "center",
      });

    doc
      .fillColor("#475569")
      .font("Helvetica")
      .fontSize(12)
      .text(`Candidate Reference: ${input.candidateRef}`, 0, 238, {
        align: "center",
      });

    // Course details
    doc
      .fillColor("#334155")
      .font("Helvetica")
      .fontSize(14)
      .text("has met all qualifying criteria for the course", 0, 276, {
        align: "center",
      });

    doc
      .fillColor("#1e3a8a")
      .font("Helvetica-Bold")
      .fontSize(20)
      .text(`${input.courseName} (${input.courseCode})`, 60, 306, {
        width: pageWidth - 120,
        align: "center",
      });

    doc
      .fillColor("#475569")
      .font("Helvetica")
      .fontSize(12)
      .text(`Training Centre: ${input.trainingCenterName}`, 0, 342, {
        align: "center",
      });

    // Divider line
    doc
      .moveTo(80, 405)
      .lineTo(pageWidth - 80, 405)
      .lineWidth(1)
      .strokeColor("#cbd5e1")
      .stroke();

    // Footer metadata
    const issueDateFormatted = input.issuedAt.toISOString().slice(0, 10);
    const colWidth = (pageWidth - 160) / 3;

    doc
      .fillColor("#64748b")
      .font("Helvetica-Bold")
      .fontSize(9)
      .text("ISSUE DATE", 80, 425, { width: colWidth, align: "left" })
      .text("CERTIFICATE ID", 80 + colWidth, 425, {
        width: colWidth,
        align: "center",
      })
      .text("VERIFICATION CODE", 80 + colWidth * 2, 425, {
        width: colWidth,
        align: "right",
      });

    doc
      .fillColor("#0f172a")
      .font("Helvetica")
      .fontSize(10)
      .text(issueDateFormatted, 80, 442, { width: colWidth, align: "left" })
      .text(input.certificateId, 80 + colWidth, 442, {
        width: colWidth,
        align: "center",
      });

    doc
      .font("Helvetica-Bold")
      .text(input.verificationCode, 80 + colWidth * 2, 442, {
        width: colWidth,
        align: "right",
      });

    doc.end();
  });
}
