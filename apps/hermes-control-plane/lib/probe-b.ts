export function probe(member: string) {
  if (member === "file_upload") {
    return {
      decision: "confirm",
      code: "file_upload_requires_approval",
      reason: "Uploading a file sends local data to a remote site. Confirm the file and the destination.",
    };
  }
  if (member === "javascript_exec") {
    return {
      decision: "confirm",
      code: "javascript_exec_requires_approval",
      reason: "Arbitrary script in page context can read or exfiltrate anything the page can. Review the code first.",
    };
  }
  return { decision: "allow" };
}
