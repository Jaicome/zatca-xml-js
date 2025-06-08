import { EGS, EGSUnitInfo } from "../zatca/egs";
import { ZATCASimplifiedInvoiceLineItem } from "../zatca/templates/simplified_tax_invoice_template";
import { ZATCASimplifiedTaxInvoice } from "../zatca/ZATCASimplifiedTaxInvoice";
import { generatePhaseOneQR } from "../zatca/qr";

const currentDate = new Date().toISOString();

// Sample line item
const line_item: ZATCASimplifiedInvoiceLineItem = {
  id: "1",
  name: "TEST NAME",
  quantity: 5,
  tax_exclusive_price: 10,
  VAT_percent: 0.15,
  other_taxes: [], // emptied other taxes to comply with Zatca BR-KSA-84
  discounts: [
    { amount: 2, reason: "A discount" },
    { amount: 2, reason: "A second discount" },
  ],
};

// Sample EGSUnit
const egsunit: EGSUnitInfo = {
  uuid: "6f4d20e0-6bfe-4a80-9389-7dabe6620f12",
  custom_id: "EGS1-886431145",
  model: "IOS",
  CRN_number: "1010010000",
  VAT_name: "ABC Company",
  VAT_number: "399999999900003",
  location: {
    city: "city",
    city_subdivision: "2345",
    street: "street",
    plot_identification: "4323",
    building: "0132",
    postal_zone: "11417",
  },
  buyer_name: "Abdullah",
  branch_name: "My Branch Name",
  branch_industry: "Food",
};

// Sample Invoice
const invoice = new ZATCASimplifiedTaxInvoice({
  props: {
    egs_info: egsunit,
    invoice_counter_number: 1,
    invoice_serial_number: "EGS1-886431145-1",
    issue_date: `${currentDate.split("T")[0]}`,
    issue_time: `${currentDate.split("T")[1].slice(0, 8)}Z`,
    previous_invoice_hash: "Hss2gNFjBY5OJn/5CEVZSSNUMrSf4QlCMxwsioPN6fA=",
    line_items: [line_item, line_item, line_item],
  },
});

const main = async () => {
  try {
    console.log("Starting ZATCA e-invoice process...");

    // TEMP_FOLDER: Use .env or set directly here (Default: /tmp/)
    // Enable for windows
    // process.env.TEMP_FOLDER = `${require("os").tmpdir()}\\`;

    console.log("1. Initializing EGS unit...");
    // Init a new EGS
    const egs = new EGS(egsunit);

    console.log("2. Generating new keys and CSR...");
    // New Keys & CSR for the EGS
    await egs.generateNewKeysAndCSR(false, "solution_name");
    console.log("Keys and CSR generated successfully");

    console.log("3. Issuing compliance certificate...");
    // Issue a new compliance cert for the EGS
    const compliance_request_id = await egs.issueComplianceCertificate(
      "123345"
    );
    console.log(
      "Compliance certificate issued with request ID:",
      compliance_request_id
    );

    console.log("4. Signing invoice...");
    // Sign invoice
    const { signed_invoice_string, invoice_hash, qr } =
      egs.signInvoice(invoice);
    console.log("Invoice signed successfully");
    console.log("Invoice hash:", invoice_hash);

    console.log("5. Checking invoice compliance...");
    // Check invoice compliance
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

    console.log("6. Issuing production certificate...");
    // Issue production certificate
    const production_request_id = await egs.issueProductionCertificate(
      compliance_request_id
    );
    console.log(
      "Production certificate issued with request ID:",
      production_request_id
    );

    console.log("7. Reporting invoice...");
    // Report invoice production
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
