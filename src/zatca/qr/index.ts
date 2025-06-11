import { XMLDocument } from "../../parser";
import { getInvoiceHash } from "../signing";

interface QRParams {
  invoice_xml: XMLDocument;
  digital_signature: string;
  public_key: Buffer;
  certificate_signature: Buffer;
}

/**
 * Generates QR for a given invoice. According to ZATCA BR-KSA-27
 * @param invoice_xml XMLDocument.
 * @param digital_signature String base64 encoded digital signature.
 * @param public_key Buffer certificate public key.
 * @param certificate_signature Buffer certificate signature.
 * @returns String base64 encoded QR data.
 */
export const generateQR = ({
  invoice_xml,
  digital_signature,
  public_key,
  certificate_signature,
}: QRParams): string => {
  // Hash
  const invoice_hash: string = getInvoiceHash(invoice_xml);

  // Extract required tags
  const seller_name = invoice_xml.get(
    "Invoice/cac:AccountingSupplierParty/cac:Party/cac:PartyLegalEntity/cbc:RegistrationName"
  )?.[0];
  const VAT_number = invoice_xml
    .get(
      "Invoice/cac:AccountingSupplierParty/cac:Party/cac:PartyTaxScheme/cbc:CompanyID"
    )?.[0]
    .toString();
  const invoice_total = invoice_xml
    .get("Invoice/cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount")?.[0]
    ["#text"].toString();
  const VAT_total = invoice_xml
    .get("Invoice/cac:TaxTotal")?.[0]
    ["cbc:TaxAmount"]["#text"].toString();

  const issue_date = invoice_xml.get("Invoice/cbc:IssueDate")?.[0];
  const issue_time = invoice_xml.get("Invoice/cbc:IssueTime")?.[0];

  // Format datetime according to ZATCA specifications (YYYY-MM-DDThh:mm:ssZ)
  const formatted_datetime = `${issue_date}T${issue_time}`;

  // Create TLV structure according to ZATCA specifications
  const tlv_data = [
    { tag: 1, value: seller_name }, // Seller Name
    { tag: 2, value: VAT_number }, // VAT Number
    { tag: 3, value: formatted_datetime }, // Timestamp
    { tag: 4, value: invoice_total }, // Invoice Total
    { tag: 5, value: VAT_total }, // VAT Total
    { tag: 6, value: invoice_hash }, // Invoice Hash
    { tag: 7, value: Buffer.from(digital_signature) }, // Digital Signature
    { tag: 8, value: public_key }, // Public Key
    { tag: 9, value: certificate_signature }, // Certificate Signature
  ];

  // Generate TLV buffer
  const tlv_parts: Uint8Array[] = tlv_data.map(({ tag, value }) => {
    const value_buffer = Buffer.from(value);
    const length_buffer = new Uint8Array([value_buffer.length]);
    const tag_buffer = new Uint8Array([tag]);
    return new Uint8Array([...tag_buffer, ...length_buffer, ...value_buffer]);
  });

  const tlv_buffer = Buffer.concat(tlv_parts);
  return tlv_buffer.toString("base64");
};

/**
 * Generates a QR for phase one given an invoice.
 * This is a temporary function for backwards compatibility while phase two is not fully deployed.
 * @param invoice_xml XMLDocument.
 * @returns String base64 encoded QR data.
 */
export const generatePhaseOneQR = ({
  invoice_xml,
}: {
  invoice_xml: XMLDocument;
}): string => {
  // Extract required tags
  const seller_name = invoice_xml.get(
    "Invoice/cac:AccountingSupplierParty/cac:Party/cac:PartyLegalEntity/cbc:RegistrationName"
  )?.[0];
  const VAT_number = invoice_xml
    .get(
      "Invoice/cac:AccountingSupplierParty/cac:Party/cac:PartyTaxScheme/cbc:CompanyID"
    )?.[0]
    .toString();
  const invoice_total = invoice_xml
    .get("Invoice/cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount")?.[0]
    ["#text"].toString();
  const VAT_total = invoice_xml
    .get("Invoice/cac:TaxTotal")?.[0]
    ["cbc:TaxAmount"]["#text"].toString();

  const issue_date = invoice_xml.get("Invoice/cbc:IssueDate")?.[0];
  const issue_time = invoice_xml.get("Invoice/cbc:IssueTime")?.[0];

  // Format datetime according to ZATCA specifications (YYYY-MM-DDThh:mm:ssZ)
  const formatted_datetime = `${issue_date}T${issue_time}`;

  // Create TLV structure for phase one
  const tlv_data = [
    { tag: 1, value: seller_name }, // Seller Name
    { tag: 2, value: VAT_number }, // VAT Number
    { tag: 3, value: formatted_datetime }, // Timestamp
    { tag: 4, value: invoice_total }, // Invoice Total
    { tag: 5, value: VAT_total }, // VAT Total
  ];

  // Generate TLV buffer
  const tlv_parts: Uint8Array[] = tlv_data.map(({ tag, value }) => {
    const value_buffer = Buffer.from(value);
    const length_buffer = new Uint8Array([value_buffer.length]);
    const tag_buffer = new Uint8Array([tag]);
    return new Uint8Array([...tag_buffer, ...length_buffer, ...value_buffer]);
  });

  const tlv_buffer = Buffer.concat(tlv_parts);
  return tlv_buffer.toString("base64");
};
