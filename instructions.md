# I2P Instructions

## Getting Started
I2P starts immediately upon launch. The first 3 to 10 minutes are spent finding peers and integrating into the network. The status card will show a "loading" message during this initialization period, which is completely normal.

## Browsing I2P Sites
To browse the invisible web, configure your web browser's proxy settings to use this server's IP address with the following ports:
- **HTTP proxy:** port 4444
- **SOCKS5 proxy:** port 4447

Please note that these proxies only work for routing traffic to internal .i2p and .b32.i2p addresses. They are not general-purpose privacy proxies for accessing the regular internet (clearnet).

## Hosting Services on I2P
To assign a hidden .b32.i2p address to any installed application, open that specific service, navigate to the Interfaces section, and add a new I2P address from the URL table to make it accessible within the network.

## NAT and Reachability
I2P may work behind a NAT out of the box by using intermediary relay nodes. If it does not, or your tunnels remain unreachable, you will need to manually port-forward.

### Port Forwarding Steps
For significantly better performance and to be classified as a directly-reachable ("O-type") router:

1. **Configure your router to forward:**
   - **UDP port 4450** → StartOS IP (e.g., 10.0.0.6):4450 for SSU2 transport
   - **TCP port 4451** → StartOS IP (e.g., 10.0.0.6):4451 for NTCP2 transport

2. **In StartOS I2P service**, use the **Configure Router** action to:
   - Set your external IP address or hostname in **External IP / Hostname** field
   - This enables the router to advertise its reachability to peers

Once port forwarding is confirmed, restart the I2P service and wait 5–10 minutes for the router to stabilize. It should transition from "Firewalled" to "OK" status.
