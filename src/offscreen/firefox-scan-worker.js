import { shannonEntropy } from '../utils/entropy.js';

self.onmessage = (event) => {
  const { allContentSources, serializableRules } = event.data;
  const allFindings = [];
  const secretRules = serializableRules.map(rule => ({
    ...rule,
    regex: new RegExp(rule.regex.source, rule.regex.flags)
  }));

  for (const { source, content, isTooLarge } of allContentSources) {
    if (!content || isTooLarge) continue;
    for (const rule of secretRules) {
      const matches = content.matchAll(rule.regex);
      for (const match of matches) {
        const secret = match[rule.group || 0];

        if (rule.entropy && shannonEntropy(secret) < rule.entropy) {
          continue;
        }

        allFindings.push({
          id: rule.id,
          description: rule.description,
          secret: secret,
          source: source,
          isSourceTooLarge: isTooLarge
        });
      }
    }
  }
  self.postMessage({ status: 'success', data: allFindings });
};