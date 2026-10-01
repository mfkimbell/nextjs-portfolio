from PIL import Image
import numpy as np, sys
src, dst = sys.argv[1], sys.argv[2]
im=np.asarray(Image.open(src).convert('RGBA')).astype(np.float32)/255
rgb=im[...,:3]; a=im[...,3:]
r,g,b=rgb[...,0],rgb[...,1],rgb[...,2]
mx=rgb.max(-1); mn=rgb.min(-1); v=mx; s=np.where(mx>1e-4,(mx-mn)/np.maximum(mx,1e-4),0)
d=np.maximum(mx-mn,1e-6)
h=np.where(mx==r, ((g-b)/d)%6, np.where(mx==g, (b-r)/d+2, (r-g)/d+4))*60
lum=0.2126*r+0.7152*g+0.0722*b
out=np.zeros_like(rgb)
red = (s>0.55)&((h<8)|(h>345))&(v>0.25)       # mouth / tongue
light = (v>0.55)&(~red)                         # muzzle, inner ears, pads
dark = (lum<0.035)&(~red)&(~light)              # nose, eye sockets, gutters
fur = ~(red|light|dark)
# fur: a medium silver-grey with a whisper of warmth, keeping the baked shading
gf = np.clip(0.13 + lum*1.65, 0, 0.62)
for i,m in enumerate((1.03,1.0,0.96)): out[...,i]=np.where(fur, gf*m, out[...,i])
# muzzle / face mask: a lighter, greyed-out cream - age, not a panda
gl = np.clip(0.42 + lum*0.42, 0, 0.74)
for i,m in enumerate((1.02,1.0,0.93)): out[...,i]=np.where(light, gl*m, out[...,i])
# mouth: dusty rose
for i,c in enumerate((0.55,0.30,0.31)): out[...,i]=np.where(red, c*(0.6+v*0.6), out[...,i])
# darks stay dark
for i in range(3): out[...,i]=np.where(dark, rgb[...,i]*1.1, out[...,i])
res=np.concatenate([np.clip(out,0,1),a],-1)
Image.fromarray((res*255).astype(np.uint8),'RGBA').save(dst, optimize=True)
