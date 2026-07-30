import { test } from "node:test";
import assert from "node:assert/strict";
import { mapStixBundle, mapStixBundleForCampaigns, mapStixBundleForTechniques, mapStixBundleForMalware } from "../src/mitreAttackAdapter.js";

function buildBundle(objects: unknown[]) {
  return { type: "bundle" as const, id: "bundle--test", objects };
}

test("maps a genuine intrusion-set to a ThreatActor with the core fields", () => {
  const bundle = buildBundle([
    {
      type: "intrusion-set",
      id: "intrusion-set--f40eb8ce-2a74-4e56-89a1-227021410142",
      name: "APT29",
      aliases: ["Cozy Bear", "The Dukes", "Midnight Blizzard"],
      description: "APT29 is a threat group attributed to Russia's Foreign Intelligence Service.",
      external_references: [{ source_name: "mitre-attack", external_id: "G0016" }],
    },
  ]);

  const [actor] = mapStixBundle(bundle);
  assert.equal(actor!.mitreGroupId, "G0016");
  assert.equal(actor!.name, "APT29");
  assert.deepEqual(actor!.aliases, ["Cozy Bear", "The Dukes", "Midnight Blizzard"]);
  assert.equal(actor!.description, "APT29 is a threat group attributed to Russia's Foreign Intelligence Service.");
  assert.equal(actor!.source, "mitre_attack");
  assert.equal(actor!.isActive, true);
});

test("filters out every non-intrusion-set object in the bundle (techniques, malware, relationships, etc.)", () => {
  const bundle = buildBundle([
    { type: "attack-pattern", id: "attack-pattern--1", name: "Some Technique" },
    { type: "malware", id: "malware--1", name: "Some Malware" },
    { type: "relationship", id: "relationship--1", source_ref: "x", target_ref: "y" },
    {
      type: "intrusion-set",
      id: "intrusion-set--1",
      name: "Lazarus Group",
      description: "x",
      external_references: [{ source_name: "mitre-attack", external_id: "G0032" }],
    },
  ]);

  const actors = mapStixBundle(bundle);
  assert.equal(actors.length, 1);
  assert.equal(actors[0]!.name, "Lazarus Group");
});

test("excludes deprecated and revoked groups, matching MITRE's own documented recommendation", () => {
  const bundle = buildBundle([
    { type: "intrusion-set", id: "intrusion-set--1", name: "Active Group", description: "x", external_references: [] },
    { type: "intrusion-set", id: "intrusion-set--2", name: "Deprecated Group", description: "x", external_references: [], x_mitre_deprecated: true },
    { type: "intrusion-set", id: "intrusion-set--3", name: "Revoked Group", description: "x", external_references: [], revoked: true },
  ]);

  const actors = mapStixBundle(bundle);
  assert.equal(actors.length, 1);
  assert.equal(actors[0]!.name, "Active Group");
});

test("a group with no aliases maps to null, not an empty array", () => {
  const bundle = buildBundle([{ type: "intrusion-set", id: "intrusion-set--1", name: "x", description: "x", external_references: [] }]);
  const [actor] = mapStixBundle(bundle);
  assert.equal(actor!.aliases, null);
});

test("a group with no mitre-attack external_reference maps mitreGroupId to null, not a crash", () => {
  const bundle = buildBundle([
    { type: "intrusion-set", id: "intrusion-set--1", name: "x", description: "x", external_references: [{ source_name: "some-other-source", external_id: "X1" }] },
  ]);
  const [actor] = mapStixBundle(bundle);
  assert.equal(actor!.mitreGroupId, null);
});

test("a group with no description at all maps to an empty string, not undefined or a crash", () => {
  const bundle = buildBundle([{ type: "intrusion-set", id: "intrusion-set--1", name: "x", external_references: [] }]);
  const [actor] = mapStixBundle(bundle);
  assert.equal(actor!.description, "");
});

test("maps a full bundle of multiple real groups, not just a single-item response", () => {
  const bundle = buildBundle([
    { type: "intrusion-set", id: "intrusion-set--1", name: "APT29", description: "x", external_references: [{ source_name: "mitre-attack", external_id: "G0016" }] },
    { type: "intrusion-set", id: "intrusion-set--2", name: "Lazarus Group", description: "x", external_references: [{ source_name: "mitre-attack", external_id: "G0032" }] },
  ]);

  const actors = mapStixBundle(bundle);
  assert.equal(actors.length, 2);
  assert.deepEqual(actors.map((a) => a.mitreGroupId), ["G0016", "G0032"]);
});

test("maps a genuine campaign to a Campaign with the core fields", () => {
  const bundle = buildBundle([
    {
      type: "campaign",
      id: "campaign--1",
      name: "C0028",
      aliases: ["SolarWinds Compromise"],
      description: "A campaign involving a supply chain compromise.",
      first_seen: "2020-03-01T00:00:00.000Z",
      last_seen: "2020-12-01T00:00:00.000Z",
      external_references: [{ source_name: "mitre-attack", external_id: "C0028" }],
    },
  ]);

  const [campaign] = mapStixBundleForCampaigns(bundle);
  assert.equal(campaign!.mitreCampaignId, "C0028");
  assert.equal(campaign!.name, "C0028");
  assert.deepEqual(campaign!.aliases, ["SolarWinds Compromise"]);
  assert.equal(campaign!.description, "A campaign involving a supply chain compromise.");
  assert.equal(campaign!.source, "mitre_attack");
  assert.equal(campaign!.firstSeen?.toISOString(), new Date("2020-03-01T00:00:00.000Z").toISOString());
  assert.equal(campaign!.lastSeen?.toISOString(), new Date("2020-12-01T00:00:00.000Z").toISOString());
  assert.equal(campaign!.isActive, true);
});

test("the actual point of this adapter: resolves a campaign's attributed-to relationship to the group's own mitreGroupId, not the raw STIX id", () => {
  const bundle = buildBundle([
    {
      type: "campaign",
      id: "campaign--1",
      name: "SolarWinds Compromise",
      description: "x",
      external_references: [{ source_name: "mitre-attack", external_id: "C0024" }],
    },
    {
      type: "intrusion-set",
      id: "intrusion-set--apt29",
      name: "APT29",
      description: "x",
      external_references: [{ source_name: "mitre-attack", external_id: "G0016" }],
    },
    { type: "relationship", relationship_type: "attributed-to", source_ref: "campaign--1", target_ref: "intrusion-set--apt29" },
  ]);

  const [campaign] = mapStixBundleForCampaigns(bundle);
  assert.deepEqual(campaign!.attributedActorIds, ["G0016"]);
});

test("a campaign attributed to a group that isn't itself present in this bundle resolves to no attribution, not a crash", () => {
  const bundle = buildBundle([
    { type: "campaign", id: "campaign--1", name: "x", description: "x", external_references: [] },
    { type: "relationship", relationship_type: "attributed-to", source_ref: "campaign--1", target_ref: "intrusion-set--unknown" },
  ]);

  const [campaign] = mapStixBundleForCampaigns(bundle);
  assert.equal(campaign!.attributedActorIds, null);
});

test("an unattributed campaign (no attributed-to relationship at all) maps attributedActorIds to null, matching MITRE's own 'may or may not be linked to a threat actor'", () => {
  const bundle = buildBundle([{ type: "campaign", id: "campaign--1", name: "x", description: "x", external_references: [] }]);
  const [campaign] = mapStixBundleForCampaigns(bundle);
  assert.equal(campaign!.attributedActorIds, null);
});

test("relationships of a different type (e.g. 'uses') are not mistaken for attribution", () => {
  const bundle = buildBundle([
    { type: "campaign", id: "campaign--1", name: "x", description: "x", external_references: [] },
    { type: "intrusion-set", id: "intrusion-set--1", name: "x", description: "x", external_references: [{ source_name: "mitre-attack", external_id: "G0099" }] },
    { type: "relationship", relationship_type: "uses", source_ref: "campaign--1", target_ref: "intrusion-set--1" },
  ]);

  const [campaign] = mapStixBundleForCampaigns(bundle);
  assert.equal(campaign!.attributedActorIds, null);
});

test("excludes deprecated and revoked campaigns, matching the same filtering as Threat Actors", () => {
  const bundle = buildBundle([
    { type: "campaign", id: "campaign--1", name: "Active Campaign", description: "x", external_references: [] },
    { type: "campaign", id: "campaign--2", name: "Deprecated Campaign", description: "x", external_references: [], x_mitre_deprecated: true },
    { type: "campaign", id: "campaign--3", name: "Revoked Campaign", description: "x", external_references: [], revoked: true },
  ]);

  const campaigns = mapStixBundleForCampaigns(bundle);
  assert.equal(campaigns.length, 1);
  assert.equal(campaigns[0]!.name, "Active Campaign");
});

test("a campaign with no first_seen/last_seen at all maps both to null, not a crash", () => {
  const bundle = buildBundle([{ type: "campaign", id: "campaign--1", name: "x", description: "x", external_references: [] }]);
  const [campaign] = mapStixBundleForCampaigns(bundle);
  assert.equal(campaign!.firstSeen, null);
  assert.equal(campaign!.lastSeen, null);
});

test("maps a genuine attack-pattern to a Technique with the core fields, tactics resolved from kill_chain_phases", () => {
  const bundle = buildBundle([
    {
      type: "attack-pattern",
      id: "attack-pattern--1",
      name: "Phishing",
      description: "Adversaries may send phishing messages.",
      kill_chain_phases: [{ kill_chain_name: "mitre-attack", phase_name: "initial-access" }],
      x_mitre_platforms: ["Windows", "macOS", "Linux"],
      external_references: [{ source_name: "mitre-attack", external_id: "T1566" }],
    },
  ]);

  const [technique] = mapStixBundleForTechniques(bundle);
  assert.equal(technique!.mitreTechniqueId, "T1566");
  assert.equal(technique!.name, "Phishing");
  assert.equal(technique!.description, "Adversaries may send phishing messages.");
  assert.deepEqual(technique!.tactics, ["initial-access"]);
  assert.deepEqual(technique!.platforms, ["Windows", "macOS", "Linux"]);
  assert.equal(technique!.isSubtechnique, false);
  assert.equal(technique!.isActive, true);
});

test("a kill chain phase from a different framework (kill_chain_name != mitre-attack) is excluded from tactics", () => {
  const bundle = buildBundle([
    {
      type: "attack-pattern",
      id: "attack-pattern--1",
      name: "x",
      description: "x",
      kill_chain_phases: [
        { kill_chain_name: "mitre-attack", phase_name: "execution" },
        { kill_chain_name: "some-other-framework", phase_name: "unrelated-phase" },
      ],
      external_references: [],
    },
  ]);

  const [technique] = mapStixBundleForTechniques(bundle);
  assert.deepEqual(technique!.tactics, ["execution"]);
});

test("a technique with no kill_chain_phases at all maps tactics to null, not a crash", () => {
  const bundle = buildBundle([{ type: "attack-pattern", id: "attack-pattern--1", name: "x", description: "x", external_references: [] }]);
  const [technique] = mapStixBundleForTechniques(bundle);
  assert.equal(technique!.tactics, null);
});

test("x_mitre_is_subtechnique maps directly to isSubtechnique", () => {
  const bundle = buildBundle([
    { type: "attack-pattern", id: "attack-pattern--1", name: "x", description: "x", external_references: [], x_mitre_is_subtechnique: true },
  ]);
  const [technique] = mapStixBundleForTechniques(bundle);
  assert.equal(technique!.isSubtechnique, true);
});

test("the actual point of this adapter's sub-technique resolution: a subtechnique-of relationship resolves to the parent's own mitreTechniqueId, not the raw STIX id", () => {
  const bundle = buildBundle([
    { type: "attack-pattern", id: "attack-pattern--parent", name: "Phishing", description: "x", external_references: [{ source_name: "mitre-attack", external_id: "T1566" }] },
    {
      type: "attack-pattern",
      id: "attack-pattern--child",
      name: "Spearphishing Attachment",
      description: "x",
      x_mitre_is_subtechnique: true,
      external_references: [{ source_name: "mitre-attack", external_id: "T1566.001" }],
    },
    { type: "relationship", relationship_type: "subtechnique-of", source_ref: "attack-pattern--child", target_ref: "attack-pattern--parent" },
  ]);

  const techniques = mapStixBundleForTechniques(bundle);
  const child = techniques.find((t) => t.mitreTechniqueId === "T1566.001");
  assert.equal(child!.parentMitreTechniqueId, "T1566");
});

test("a top-level technique (no subtechnique-of relationship) has parentMitreTechniqueId null", () => {
  const bundle = buildBundle([{ type: "attack-pattern", id: "attack-pattern--1", name: "x", description: "x", external_references: [{ source_name: "mitre-attack", external_id: "T1566" }] }]);
  const [technique] = mapStixBundleForTechniques(bundle);
  assert.equal(technique!.parentMitreTechniqueId, null);
});

test("resolves 'uses' relationships from both an intrusion-set and a campaign to the technique's own usage attribution, using the real mitre ids not raw STIX ids", () => {
  const bundle = buildBundle([
    { type: "attack-pattern", id: "attack-pattern--1", name: "x", description: "x", external_references: [{ source_name: "mitre-attack", external_id: "T1566" }] },
    { type: "intrusion-set", id: "intrusion-set--apt29", name: "APT29", description: "x", external_references: [{ source_name: "mitre-attack", external_id: "G0016" }] },
    { type: "campaign", id: "campaign--solarwinds", name: "SolarWinds Compromise", description: "x", external_references: [{ source_name: "mitre-attack", external_id: "C0024" }] },
    { type: "relationship", relationship_type: "uses", source_ref: "intrusion-set--apt29", target_ref: "attack-pattern--1" },
    { type: "relationship", relationship_type: "uses", source_ref: "campaign--solarwinds", target_ref: "attack-pattern--1" },
  ]);

  const [technique] = mapStixBundleForTechniques(bundle);
  assert.deepEqual(technique!.usedByActorMitreGroupIds, ["G0016"]);
  assert.deepEqual(technique!.usedByCampaignMitreCampaignIds, ["C0024"]);
});

test("a technique with no usage relationships at all maps both usage fields to null, matching an unused technique honestly", () => {
  const bundle = buildBundle([{ type: "attack-pattern", id: "attack-pattern--1", name: "x", description: "x", external_references: [] }]);
  const [technique] = mapStixBundleForTechniques(bundle);
  assert.equal(technique!.usedByActorMitreGroupIds, null);
  assert.equal(technique!.usedByCampaignMitreCampaignIds, null);
});

test("excludes deprecated and revoked techniques, matching the same filtering as Threat Actors and Campaigns", () => {
  const bundle = buildBundle([
    { type: "attack-pattern", id: "attack-pattern--1", name: "Active Technique", description: "x", external_references: [] },
    { type: "attack-pattern", id: "attack-pattern--2", name: "Deprecated Technique", description: "x", external_references: [], x_mitre_deprecated: true },
    { type: "attack-pattern", id: "attack-pattern--3", name: "Revoked Technique", description: "x", external_references: [], revoked: true },
  ]);

  const techniques = mapStixBundleForTechniques(bundle);
  assert.equal(techniques.length, 1);
  assert.equal(techniques[0]!.name, "Active Technique");
});

test("filters out every non-attack-pattern object in the bundle when mapping techniques", () => {
  const bundle = buildBundle([
    { type: "intrusion-set", id: "intrusion-set--1", name: "Some Group", description: "x", external_references: [] },
    { type: "campaign", id: "campaign--1", name: "Some Campaign", description: "x", external_references: [] },
    { type: "relationship", relationship_type: "uses", source_ref: "x", target_ref: "y" },
    { type: "attack-pattern", id: "attack-pattern--1", name: "Real Technique", description: "x", external_references: [] },
  ]);

  const techniques = mapStixBundleForTechniques(bundle);
  assert.equal(techniques.length, 1);
  assert.equal(techniques[0]!.name, "Real Technique");
});

test("maps a genuine malware object to a Malware entity, aliases from x_mitre_aliases not the plain aliases field", () => {
  const bundle = buildBundle([
    {
      type: "malware",
      id: "malware--1",
      name: "Agent Tesla",
      description: "A spyware Trojan written for the .NET framework.",
      x_mitre_aliases: ["Negasteal"],
      x_mitre_platforms: ["Windows"],
      external_references: [{ source_name: "mitre-attack", external_id: "S0331" }],
    },
  ]);

  const [malware] = mapStixBundleForMalware(bundle);
  assert.equal(malware!.mitreSoftwareId, "S0331");
  assert.equal(malware!.name, "Agent Tesla");
  assert.deepEqual(malware!.aliases, ["Negasteal"]);
  assert.equal(malware!.description, "A spyware Trojan written for the .NET framework.");
  assert.equal(malware!.softwareType, "malware");
  assert.equal(malware!.source, "mitre_attack");
  assert.deepEqual(malware!.platforms, ["Windows"]);
  assert.equal(malware!.isActive, true);
});

test("a tool object maps softwareType to 'tool', not 'malware' -- the two STIX types this mapper unifies", () => {
  const bundle = buildBundle([{ type: "tool", id: "tool--1", name: "Mimikatz", description: "x", external_references: [] }]);
  const [software] = mapStixBundleForMalware(bundle);
  assert.equal(software!.softwareType, "tool");
});

test("a malware object with no x_mitre_aliases maps aliases to null, not an empty array or a crash from the wrong field name", () => {
  const bundle = buildBundle([{ type: "malware", id: "malware--1", name: "x", description: "x", external_references: [] }]);
  const [malware] = mapStixBundleForMalware(bundle);
  assert.equal(malware!.aliases, null);
});

test("the actual point of this adapter's three-way usage resolution: who uses this malware (Group, Campaign) and what this malware itself uses (Technique) are resolved independently, using real mitre ids not raw STIX ids", () => {
  const bundle = buildBundle([
    { type: "malware", id: "malware--1", name: "Agent Tesla", description: "x", external_references: [{ source_name: "mitre-attack", external_id: "S0331" }] },
    { type: "intrusion-set", id: "intrusion-set--apt29", name: "APT29", description: "x", external_references: [{ source_name: "mitre-attack", external_id: "G0016" }] },
    { type: "campaign", id: "campaign--solarwinds", name: "SolarWinds Compromise", description: "x", external_references: [{ source_name: "mitre-attack", external_id: "C0024" }] },
    { type: "attack-pattern", id: "attack-pattern--creddump", name: "Credential Dumping", description: "x", external_references: [{ source_name: "mitre-attack", external_id: "T1003" }] },
    { type: "relationship", relationship_type: "uses", source_ref: "intrusion-set--apt29", target_ref: "malware--1" },
    { type: "relationship", relationship_type: "uses", source_ref: "campaign--solarwinds", target_ref: "malware--1" },
    { type: "relationship", relationship_type: "uses", source_ref: "malware--1", target_ref: "attack-pattern--creddump" },
  ]);

  const [malware] = mapStixBundleForMalware(bundle);
  assert.deepEqual(malware!.usedByActorMitreGroupIds, ["G0016"]);
  assert.deepEqual(malware!.usedByCampaignMitreCampaignIds, ["C0024"]);
  assert.deepEqual(malware!.usesMitreTechniqueIds, ["T1003"]);
});

test("a malware object with no usage relationships at all maps all three usage fields to null, matching genuinely unused/unattributed software honestly", () => {
  const bundle = buildBundle([{ type: "malware", id: "malware--1", name: "x", description: "x", external_references: [] }]);
  const [malware] = mapStixBundleForMalware(bundle);
  assert.equal(malware!.usedByActorMitreGroupIds, null);
  assert.equal(malware!.usedByCampaignMitreCampaignIds, null);
  assert.equal(malware!.usesMitreTechniqueIds, null);
});

test("excludes deprecated and revoked malware/tools, matching the same filtering as every other mapper in this file", () => {
  const bundle = buildBundle([
    { type: "malware", id: "malware--1", name: "Active Malware", description: "x", external_references: [] },
    { type: "tool", id: "tool--1", name: "Deprecated Tool", description: "x", external_references: [], x_mitre_deprecated: true },
    { type: "malware", id: "malware--2", name: "Revoked Malware", description: "x", external_references: [], revoked: true },
  ]);

  const software = mapStixBundleForMalware(bundle);
  assert.equal(software.length, 1);
  assert.equal(software[0]!.name, "Active Malware");
});

test("filters out every non-malware/tool object in the bundle when mapping software", () => {
  const bundle = buildBundle([
    { type: "intrusion-set", id: "intrusion-set--1", name: "Some Group", description: "x", external_references: [] },
    { type: "attack-pattern", id: "attack-pattern--1", name: "Some Technique", description: "x", external_references: [] },
    { type: "relationship", relationship_type: "uses", source_ref: "x", target_ref: "y" },
    { type: "malware", id: "malware--1", name: "Real Malware", description: "x", external_references: [] },
  ]);

  const software = mapStixBundleForMalware(bundle);
  assert.equal(software.length, 1);
  assert.equal(software[0]!.name, "Real Malware");
});
