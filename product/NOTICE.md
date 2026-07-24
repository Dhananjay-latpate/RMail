# NOTICE — Third-Party Software

The **RMail** product in this `product/` directory (webmail, api, portal) is
proprietary software — see [`LICENSE`](./LICENSE). It is built to run **alongside**
Stalwart Mail Server, an independent program that RMail communicates with only
over standard network protocols (JMAP over HTTP, and the Stalwart administration
REST API).

## Stalwart Mail Server

- **License:** GNU Affero General Public License v3.0 (`AGPL-3.0-only`). Certain
  Enterprise features are licensed under the Stalwart Enterprise License v2
  (`SELv2`).
- **Full license texts:** see the repository's top-level [`LICENSES/`](../LICENSES)
  directory.
- **Source code:** RMail runs Stalwart **unmodified**. Its complete
  corresponding source is publicly available at
  <https://github.com/stalwartlabs/stalwart>.
- Stalwart's copyright and license notices are preserved and are not removed or
  altered.

## License boundary

The RMail `product/` code is a **separate work**, licensed proprietarily, that
interacts with Stalwart only through network interfaces. It is *aggregated with*
— but is **not a derivative work of** — the AGPL-licensed Stalwart server.
Placing the two in the same repository is "mere aggregation" and does not place
the RMail code under the AGPL.

If RMail is ever changed to **modify** Stalwart's source and run that modified
version as a network service, AGPL-3.0 obligations (offering the modified source
to users) would apply — or a commercial Stalwart license would be required. As
long as Stalwart is run unmodified, no such obligation is triggered.

---

*This NOTICE is informational and is not legal advice. Confirm your specific
distribution and hosting model with qualified counsel.*
