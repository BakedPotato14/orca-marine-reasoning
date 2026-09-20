import geopandas as gpd
import os

base_dir = os.path.dirname(os.path.abspath(__file__))
shp_path = os.path.join(base_dir, "eez_data", "eez_v12.shp")

print("Loading shapefile...")
gdf = gpd.read_file(shp_path)

# Filter for India AND its primary maritime neighbors
target_countries = [
    "India", "Sri Lanka", "Pakistan", "Bangladesh", "Myanmar", "Maldives"
]
region_eez = gdf[gdf["SOVEREIGN1"].isin(target_countries)]

print(f"Found {len(region_eez)} row(s) for the region.")

out_path = os.path.join(base_dir, "maritime_boundaries.geojson")
print(f"Exporting multi-country boundaries to {out_path}...")
region_eez.to_file(out_path, driver="GeoJSON")
print("Success! Regional GeoJSON created.")