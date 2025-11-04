import { EGS, EGSUnitInfo } from "../zatca/egs";
import {
  ZATCAInvoiceLineItem,
  ZATCAInvoiceTypes,
} from "../zatca/templates/simplified_tax_invoice_template";
import { ZATCAInvoice } from "../zatca/ZATCASimplifiedTaxInvoice";
import * as fs from "fs";

const now = new Date();
const issueDate = now.toISOString().split("T")[0];
const issueTime = now.toISOString().split("T")[1].slice(0, 8);

// Sample line items
const line_item_1: ZATCAInvoiceLineItem = {
  id: "1",
  name: "TEST NAME",
  quantity: 44,
  tax_exclusive_price: 22,
  VAT_percent: 0.15,
  discounts: [{ amount: 1, reason: "discount" }],
};

const line_item_2: ZATCAInvoiceLineItem = {
  id: "2",
  name: "TEST NAME 1",
  quantity: 10,
  tax_exclusive_price: 5,
  VAT_percent: 0.05,
  discounts: [{ amount: 2, reason: "discount" }],
};

const line_item_3: ZATCAInvoiceLineItem = {
  id: "3",
  name: "TEST NAME 2",
  quantity: 10,
  tax_exclusive_price: 5,
  VAT_percent: 0.0,
  vat_category: {
    code: "Z",
    reason_code: "VATEX-SA-34-4",
    reason: "Supply of a qualifying means of transport",
  },
};

// Sample EGSUnit
const egsunit: EGSUnitInfo = {
  uuid: "6f4d20e0-6bfe-4a80-9389-7dabe6620f14",
  custom_id: "EGS2",
  model: "IOS",
  CRN_number: "7032256278",
  VAT_name: "شركة جاي كوم لتقنية المعلومات",
  VAT_number: "311497191800003",
  location: {
    city: "Khobar",
    city_subdivision: "West",
    street: "King Fahahd st",
    plot_identification: "0000",
    building: "0000",
    postal_zone: "31952",
  },
  customer_info: {
    city: "jeddah",
    city_subdivision: "ssss",
    buyer_name: "S7S",
    building: "00",
    postal_zone: "00000",
    street: "__",
    vat_number: "311498192800003",
    customer_crn_number: "7052156278", // 10-digit CRN for the buyer
  },
  branch_name: "My Branch Name",
  branch_industry: "Food",
};

// Sample Invoice
const invoice = new ZATCAInvoice({
  props: {
    egs_info: egsunit,
    invoice_counter_number: 1,
    invoice_type: ZATCAInvoiceTypes.INVOICE,
    invoice_code: "0200000",
    invoice_serial_number: "EGS1-886431145-101",
    issue_date: issueDate,
    issue_time: `${issueTime}Z`,
    previous_invoice_hash: "NA==",
    line_items: [line_item_1, line_item_2, line_item_3],
    actual_delivery_date: "2024-02-29",
  },
  acceptWarning: true,
});
const invoiceXMLString = invoice.toString();
fs.writeFileSync("test_invoice.xml", invoiceXMLString, "utf8");
console.log("✅ Invoice XML (unsigned) saved as test_invoice.xml");

const main = async () => {
  try {
    console.log("Starting ZATCA e-invoice process...");

    // 1. Initialize EGS unit
    const egs = new EGS(egsunit, "simulation");

    // 2. Generate Keys & CSR
    await egs.generateNewKeysAndCSR(false, "solution_name");
    console.log("Keys and CSR generated successfully");

    // 3. Issue compliance certificate
    const compliance_request_id = await egs.issueComplianceCertificate(
      "746141"
    );
    console.log(
      "Compliance certificate issued with request ID:",
      compliance_request_id
    );

    // 4. Sign invoice and get the signed XML
    const { signed_invoice_string, invoice_hash, qr } =
      egs.signInvoice(invoice);
    fs.writeFileSync("invoice.xml", signed_invoice_string, "utf8");
    console.log("✅ Signed Invoice XML saved as test_invoice_signed.xml");
    console.log("Invoice hash:", invoice_hash);

    // 5. Check invoice compliance
    const complianceResult = await egs.checkInvoiceCompliance(
      signed_invoice_string,
      invoice_hash
    );
    console.log(
      "Compliance check result:",
      JSON.stringify(complianceResult, null, 2)
    );
    if (complianceResult.validationResults?.warningMessages) {
      console.log("\nWarning Messages:");
      complianceResult.validationResults.warningMessages.forEach(
        (warning: any, index: number) => {
          console.log(`${index + 1}. ${JSON.stringify(warning, null, 2)}`);
        }
      );
    }

    // 6. Issue production certificate
    const production_request_id = await egs.issueProductionCertificate(
      compliance_request_id
    );
    console.log(
      "Production certificate issued with request ID:",
      production_request_id
    );

    // 7. Report invoice
    let reportedInvoice = await egs.reportInvoice(
      signed_invoice_string,
      invoice_hash
    );
    console.log("Invoice reporting status:", reportedInvoice?.reportingStatus);

    console.log("Process completed successfully!");
  } catch (error: any) {
    console.error("Error occurred in the process:");
    console.error("Error message:", error.message);
    if (error.response) {
      console.error("API Response data:", error.response.data);
      console.error("API Response status:", error.response.status);
      console.error("API Response headers:", error.response.headers);
    }
    console.error("Full error object:", JSON.stringify(error, null, 2));
  }
};

main();
