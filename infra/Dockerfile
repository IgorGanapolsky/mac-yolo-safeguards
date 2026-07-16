FROM tailscale/tailscale:stable

# Custom boot: run tailscaled, bring the node up as a tagged relay, then enable
# peer-relay mode (tailscale set --relay-server-port). The stock containerboot
# entrypoint can't run the post-up `set` subcommand, so we wrap the binaries.
COPY start.sh /start.sh
RUN chmod +x /start.sh
ENTRYPOINT ["/start.sh"]
