import { describe, expect, it } from "vitest";
import {
  NO_PHONE_CARRIER_LABEL,
  PHONE_CARRIERS,
  findPhoneCarrier,
  phoneCarrierGatewayDomain,
} from "../shared/phone-carriers";
import * as mobileCarriers from "../mobile/src/shared/phone-carriers";
import { PHONE_CARRIERS as SHARED_INDEX_CARRIERS } from "../shared";
import { PHONE_CARRIERS as MOBILE_INDEX_CARRIERS } from "../mobile/src/shared";
import webSettingsSource from "../app/routes/$id.tsx?raw";
import serverSource from "../server.ts?raw";
import mobileSettingsSource from "../mobile/src/screens/SettingsScreen.tsx?raw";
import mobileThemeSource from "../mobile/src/theme/theme.ts?raw";

// The values people already have saved in user_settings.phone_carrier, and the
// gateway each one was sent to before the list moved into shared/. These must
// never change, or saved carriers would stop working.
const SAVED_CARRIER_GATEWAYS: Record<string, string> = {
  verizon: "vtext.com",
  att: "txt.att.net",
  tmobile: "tmomail.net",
  sprint: "messaging.sprintpcs.com",
  boost: "myboostmobile.com",
  cricket: "sms.cricketwireless.net",
  uscellular: "email.uscc.net",
  googlefi: "msg.fi.google.com",
};

describe("shared phone carrier list", () => {
  it("lists the same 8 carriers, in the web dropdown order", () => {
    expect(PHONE_CARRIERS.map((c) => [c.id, c.label])).toEqual([
      ["verizon", "Verizon"],
      ["att", "AT&T"],
      ["tmobile", "T-Mobile"],
      ["sprint", "Sprint"],
      ["googlefi", "Google Fi"],
      ["boost", "Boost Mobile"],
      ["cricket", "Cricket Wireless"],
      ["uscellular", "US Cellular"],
    ]);
  });

  it("keeps every saved carrier value and its gateway domain unchanged", () => {
    const gateways = Object.fromEntries(PHONE_CARRIERS.map((c) => [c.id, c.gatewayDomain]));
    expect(gateways).toEqual(SAVED_CARRIER_GATEWAYS);
    for (const [id, domain] of Object.entries(SAVED_CARRIER_GATEWAYS)) {
      expect(phoneCarrierGatewayDomain(id)).toBe(domain);
    }
  });

  it("has unique ids", () => {
    expect(new Set(PHONE_CARRIERS.map((c) => c.id)).size).toBe(PHONE_CARRIERS.length);
  });

  it("matches saved values case-insensitively, like the reminder sender always did", () => {
    expect(phoneCarrierGatewayDomain("TMobile")).toBe("tmomail.net");
    expect(findPhoneCarrier(" GoogleFi ")?.label).toBe("Google Fi");
  });

  it("returns nothing for no carrier or an unknown one", () => {
    expect(findPhoneCarrier("")).toBeUndefined();
    expect(findPhoneCarrier(null)).toBeUndefined();
    expect(phoneCarrierGatewayDomain("unknown")).toBeUndefined();
  });

  it("is exported from shared/index for web and mobile", () => {
    expect(SHARED_INDEX_CARRIERS).toBe(PHONE_CARRIERS);
    expect(MOBILE_INDEX_CARRIERS).toEqual(PHONE_CARRIERS);
  });

  it("mobile's mirrored copy matches the shared one", () => {
    expect(mobileCarriers.PHONE_CARRIERS).toEqual(PHONE_CARRIERS);
    expect(mobileCarriers.NO_PHONE_CARRIER_LABEL).toBe(NO_PHONE_CARRIER_LABEL);
    expect(NO_PHONE_CARRIER_LABEL).toBe("None (Twilio)");
  });
});

describe("carrier list is not duplicated", () => {
  it("web settings render options from the shared list", () => {
    expect(webSettingsSource).toContain("PHONE_CARRIERS.map(");
    expect(webSettingsSource).not.toMatch(/<option value="verizon"/);
  });

  it("the reminder sender looks up gateways from the shared list", () => {
    expect(serverSource).toContain("phoneCarrierGatewayDomain(reminder.phoneCarrier)");
    expect(serverSource).not.toContain("vtext.com");
  });

  it("mobile settings use the shared picker instead of a local list", () => {
    expect(mobileThemeSource).not.toContain("PHONE_CARRIERS");
    expect(mobileSettingsSource).toContain("PhoneCarrierPickerModal");
    expect(mobileSettingsSource).not.toContain("carrierChip");
  });
});
