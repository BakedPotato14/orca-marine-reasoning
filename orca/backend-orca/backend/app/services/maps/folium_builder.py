"""Builds a folium.Map from accumulated ORCAState and returns it as
an HTML string via map.get_root().render() - for the frontend to
embed in an iframe (srcDoc). Keep this as the ONLY place folium is
imported - agents never touch it directly."""
