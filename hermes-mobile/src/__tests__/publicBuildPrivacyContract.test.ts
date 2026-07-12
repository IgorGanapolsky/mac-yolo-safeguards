const path = require('path');
const {
  scanProductionSource,
  scanText,
} = require('../../scripts/scan-public-mobile-artifacts');

describe('public mobile build privacy contract', () => {
  it('contains no owner machine, workspace, tailnet, or gateway credential defaults', () => {
    const mobileRoot = path.resolve(__dirname, '../..');
    expect(scanProductionSource(mobileRoot)).toEqual([]);
  });

  it('detects private markers without printing their values', () => {
    const gatewayCredential = ['sk', 'hermes', 'fixturecredential123'].join('-');
    const ownerDevice = ['igors', 'mac', 'fixture'].join('-');
    const cgnatAddress = ['100', '100', '10', '20'].join('.');
    const findings = scanText(
      `${gatewayCredential}\n${ownerDevice}\n${cgnatAddress}`,
      'fixture.bundle',
    );

    expect(findings.map((finding: { id: string }) => finding.id).sort()).toEqual([
      'embedded_gateway_credential',
      'literal_tailscale_cgnat_address',
      'owner_device_identifier',
    ]);
    expect(JSON.stringify(findings)).not.toContain(gatewayCredential);
    expect(JSON.stringify(findings)).not.toContain(ownerDevice);
    expect(JSON.stringify(findings)).not.toContain(cgnatAddress);
  });
});
