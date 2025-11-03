import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import { cleanUpCertificateString } from "../signing";

// Enhanced logger function
const debugLog = (message: string, data?: any, isError: boolean = false) => {
  const timestamp = new Date().toISOString();
  const logData = data ? `\n${JSON.stringify(data, null, 2)}` : '';
  const logMessage = `[${timestamp}] ${message}${logData}`;
  
  if (isError) {
    console.error('\x1b[31m%s\x1b[0m', logMessage); // Red for errors
  } else {
    console.log('\x1b[36m%s\x1b[0m', logMessage); // Cyan for debug logs
  }
};

// Add request interceptor
axios.interceptors.request.use(
  (config: AxiosRequestConfig) => {
    debugLog(`Request: ${config.method?.toUpperCase()} ${config.url}`, {
      headers: config.headers,
      params: config.params,
      data: config.data ? JSON.parse(JSON.stringify(config.data)) : undefined
    });
    return config;
  },
  (error) => {
    debugLog('Request Error:', error, true);
    return Promise.reject(error);
  }
);

// Add response interceptor
axios.interceptors.response.use(
  (response: AxiosResponse) => {
    debugLog(`Response: ${response.status} ${response.statusText}`, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data
    });
    return response;
  },
  (error: AxiosError) => {
    if (error.response) {
      debugLog('API Error Response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        headers: error.response.headers,
        data: error.response.data,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          headers: error.config?.headers,
        }
      }, true);
    } else if (error.request) {
      debugLog('No response received:', error.request, true);
    } else {
      debugLog('Request setup error:', error.message, true);
    }
    return Promise.reject(error);
  }
);

const settings = {
  API_VERSION: "V2",
  SANDBOX_BASEURL:
    "https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal",
  SIMULATION_BASEURL: "https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation",
  PRODUCTION_BASEURL: "https://gw-fatoora.zatca.gov.sa/e-invoicing/core",
};

interface ComplianceAPIInterface {
  /**
   * Requests a new compliance certificate and secret.
   * @param csr String CSR
   * @param otp String Tax payer provided OTP from Fatoora portal
   * @returns issued_certificate: string, api_secret: string, or throws on error.
   */
  issueCertificate: (
    csr: string,
    otp: string
  ) => Promise<{
    issued_certificate: string;
    api_secret: string;
    request_id: string;
  }>;

  /**
   * Checks compliance of a signed ZATCA XML.
   * @param signed_xml_string String.
   * @param invoice_hash String.
   * @param egs_uuid String.
   * @returns Any status.
   */
  checkInvoiceCompliance: (
    signed_xml_string: string,
    invoice_hash: string,
    egs_uuid: string
  ) => Promise<any>;
}

interface ProductionAPIInterface {
  /**
   * Requests a new production certificate and secret.
   * @param compliance_request_id String compliance_request_id
   * @returns issued_certificate: string, api_secret: string, or throws on error.
   */
  issueCertificate: (compliance_request_id: string) => Promise<{
    issued_certificate: string;
    api_secret: string;
    request_id: string;
  }>;

  /**
   * Report signed ZATCA XML.
   * @param signed_xml_string String.
   * @param invoice_hash String.
   * @param egs_uuid String.
   * @returns Any status.
   */
  reportInvoice: (
    signed_xml_string: string,
    invoice_hash: string,
    egs_uuid: string
  ) => Promise<any>;
  /**
   * Report signed ZATCA XML.
   * @param signed_xml_string String.
   * @param invoice_hash String.
   * @param egs_uuid String.
   * @returns Any status.
   */
  clearanceInvoice: (
    signed_xml_string: string,
    invoice_hash: string,
    egs_uuid: string
  ) => Promise<any>;
}

class API {
  private env: string;

  constructor(env: "production" | "simulation" | "development") {
    this.env = env;
  }

  private getAuthHeaders = (certificate?: string, secret?: string): any => {
    if (certificate && secret) {
      const certificate_stripped = cleanUpCertificateString(certificate);
      const basic = Buffer.from(
        `${Buffer.from(certificate_stripped).toString("base64")}:${secret}`
      ).toString("base64");
      return {
        Authorization: `Basic ${basic}`,
      };
    }
    return {};
  };

  compliance(certificate?: string, secret?: string): ComplianceAPIInterface {
    const auth_headers = this.getAuthHeaders(certificate, secret);
    const base_url =
      this.env == "production"
        ? settings.PRODUCTION_BASEURL
        : this.env == "simulation"
        ? settings.SIMULATION_BASEURL
        : settings.SANDBOX_BASEURL;

    const issueCertificate = async (
      csr: string,
      otp: string
    ): Promise<{
      issued_certificate: string;
      api_secret: string;
      request_id: string;
    }> => {
      const headers = {
        "Accept-Version": settings.API_VERSION,
        OTP: otp,
      };

      const response = await axios.post(
        `${base_url}/compliance`,
        { csr: Buffer.from(csr).toString("base64") },
        { headers: { ...auth_headers, ...headers } }
      );

      if (![200, 202].includes(response.status))
        throw new Error("Error issuing a compliance certificate.");

      let issued_certificate = Buffer.from(
        response.data.binarySecurityToken,
        "base64"
      ).toString();
      issued_certificate = `-----BEGIN CERTIFICATE-----\n${issued_certificate}\n-----END CERTIFICATE-----`;
      const api_secret = response.data.secret;

      return {
        issued_certificate,
        api_secret,
        request_id: response.data.requestID,
      };
    };

    const checkInvoiceCompliance = async (
      signed_xml_string: string,
      invoice_hash: string,
      egs_uuid: string
    ): Promise<any> => {
      try {
        debugLog('Starting compliance check with parameters:', {
          invoice_hash,
          egs_uuid,
          signed_xml_length: signed_xml_string.length,
          signed_xml_start: signed_xml_string.substring(0, 200) + '...' // First 200 chars of XML
        });

        const headers = {
          "Accept-Version": settings.API_VERSION,
          "Accept-Language": "en",
        };

        const requestData = {
          invoiceHash: invoice_hash,
          uuid: egs_uuid,
          invoice: Buffer.from(signed_xml_string).toString("base64"),
        };

        debugLog('Sending compliance check request', {
          url: `${base_url}/compliance/invoices`,
          headers: { ...auth_headers, ...headers },
          data: { ...requestData, invoice: '[BASE64_ENCODED_XML]' } // Don't log full XML
        });

        const response = await axios.post(
          `${base_url}/compliance/invoices`,
          requestData,
          { 
            headers: { ...auth_headers, ...headers },
            timeout: 30000 // 30 seconds timeout
          }
        );

        debugLog('Compliance check successful', {
          status: response.status,
          data: response.data
        });

        if (![200, 202].includes(response.status)) {
          throw new Error(`Unexpected status code: ${response.status}`);
        }

        return response.data;
      } catch (error: any) {
        debugLog('Compliance check failed', error, true);
        
        // Enhanced error details
        let errorDetails = 'Unknown error';
        if (error.response) {
          errorDetails = `Status: ${error.response.status} - ${JSON.stringify(error.response.data)}`;
          
          // Log validation errors if present
          if (error.response.data?.validationResults?.errorMessages?.length) {
            errorDetails += '\nValidation Errors:';
            error.response.data.validationResults.errorMessages.forEach((err: any, index: number) => {
              errorDetails += `\n${index + 1}. ${err.message} (${err.code})`;
            });
          }
          
          if (error.response.data?.validationResults?.warningMessages?.length) {
            errorDetails += '\nValidation Warnings:';
            error.response.data.validationResults.warningMessages.forEach((warn: any, index: number) => {
              errorDetails += `\n${index + 1}. ${warn.message} (${warn.code})`;
            });
          }
        } else if (error.request) {
          errorDetails = 'No response received from server';
        } else {
          errorDetails = error.message;
        }
        
        throw new Error(`Compliance check failed: ${errorDetails}`);
      }
    };

    return {
      issueCertificate,
      checkInvoiceCompliance,
    };
  }

  production(certificate?: string, secret?: string): ProductionAPIInterface {
    const auth_headers = this.getAuthHeaders(certificate, secret);
    const base_url =
      this.env == "production"
        ? settings.PRODUCTION_BASEURL
        : this.env == "simulation"
        ? settings.SIMULATION_BASEURL
        : settings.SANDBOX_BASEURL;

    const issueCertificate = async (
      compliance_request_id: string
    ): Promise<{
      issued_certificate: string;
      api_secret: string;
      request_id: string;
    }> => {
      const headers = {
        "Accept-Version": settings.API_VERSION,
      };

      const response = await axios.post(
        `${base_url}/production/csids`,
        { compliance_request_id: compliance_request_id },
        { headers: { ...auth_headers, ...headers } }
      );

      if (![200, 202].includes(response.status))
        throw new Error("Error issuing a production certificate.");

      let issued_certificate = Buffer.from(
        response.data.binarySecurityToken,
        "base64"
      ).toString();
      issued_certificate = `-----BEGIN CERTIFICATE-----\n${issued_certificate}\n-----END CERTIFICATE-----`;
      const api_secret = response.data.secret;

      return {
        issued_certificate,
        api_secret,
        request_id: response.data.requestID,
      };
    };

    const reportInvoice = async (
      signed_xml_string: string,
      invoice_hash: string,
      egs_uuid: string
    ): Promise<any> => {
      const headers = {
        "Accept-Version": settings.API_VERSION,
        "Accept-Language": "en",
        "Clearance-Status": "0",
      };

      const response = await axios.post(
        `${base_url}/invoices/reporting/single`,
        {
          invoiceHash: invoice_hash,
          uuid: egs_uuid,
          invoice: Buffer.from(signed_xml_string).toString("base64"),
        },
        { headers: { ...auth_headers, ...headers } }
      );

      if (![200, 202].includes(response.status))
        throw new Error("Error in reporting invoice.");
      return response.data;
    };

    const clearanceInvoice = async (
      signed_xml_string: string,
      invoice_hash: string,
      egs_uuid: string
    ): Promise<any> => {
      const headers = {
        "Accept-Version": settings.API_VERSION,
        "Accept-Language": "en",
        "Clearance-Status": "1",
      };

      const response = await axios.post(
        `${base_url}/invoices/clearance/single`,
        {
          invoiceHash: invoice_hash,
          uuid: egs_uuid,
          invoice: Buffer.from(signed_xml_string).toString("base64"),
        },
        { headers: { ...auth_headers, ...headers } }
      );

      if (![200, 202].includes(response.status))
        throw new Error("Error in clearance invoice.");
      return response.data;
    };

    return {
      issueCertificate,
      reportInvoice,
      clearanceInvoice,
    };
  }
}

export default API;
