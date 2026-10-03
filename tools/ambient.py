import numpy as np, wave, sys
SR=44100
BPM=66.0
BEAT=60.0/BPM
BARS=40
N=int(round(BARS*4*BEAT*SR))
rng=np.random.default_rng(7)
L=np.zeros(N,np.float32); R=np.zeros(N,np.float32)
def mtof(m): return 440.0*2**((m-69)/12.0)

def add(buf,start,sig,gain=1.0):
    # circular add so notes wrap around the loop point
    n=len(sig); s=int(start)%N
    first=min(n,N-s)
    buf[s:s+first]+=sig[:first]*gain
    rest=n-first
    while rest>0:
        k=min(rest,N); buf[:k]+=sig[first:first+k]*gain; first+=k; rest-=k
def place(sig,t,pan=0.0,gain=1.0):
    a=(pan+1)*np.pi/4
    add(L,t*SR,sig,gain*np.cos(a)); add(R,t*SR,sig,gain*np.sin(a))
def env(n,att,rel,sus=1.0):
    e=np.ones(n,np.float32)*sus
    a=int(att*SR); r=int(rel*SR)
    a=min(a,n//2); r=min(r,n-a)
    if a>0: e[:a]=0.5-0.5*np.cos(np.linspace(0,np.pi,a))
    if r>0: e[n-r:]*=0.5+0.5*np.cos(np.linspace(0,np.pi,r))
    return e

def harp(m,vel=1.0,dur=6.0):
    n=int(dur*SR); t=np.arange(n)/SR; f=mtof(m); out=np.zeros(n,np.float32)
    for k in range(1,12):
        if f*k>5000: break
        amp=1.0/k**1.25
        dec=1.1+0.55*k*(1+f/800)
        fk=f*k*np.sqrt(1+0.00015*k*k)
        out+=(amp*np.exp(-t*dec/ (1+0.0*k)))*np.sin(2*np.pi*fk*t+rng.uniform(0,6.28))
    out*=np.minimum(1,t/0.004)  # no click
    out*=env(n,0,0.4)
    return out*vel*0.5

def bell(m,vel=1.0,dur=7.0):
    n=int(dur*SR); t=np.arange(n)/SR; f=mtof(m); out=np.zeros(n,np.float32)
    for r,a,d in [(1,1,0.9),(2.01,0.45,1.3),(2.76,0.35,1.7),(4.07,0.18,2.4),(5.43,0.1,3.2)]:
        if f*r<7000: out+=a*np.exp(-t*d)*np.sin(2*np.pi*f*r*t+rng.uniform(0,6.28))
    out*=np.minimum(1,t/0.006)*env(n,0,0.5)
    return out*vel*0.22

def stringpad(m,dur,detunes=(-9,0,8),maxf=2600,att=1.4,rel=2.2):
    n=int(dur*SR); t=np.arange(n)/SR; f0=mtof(m); out=np.zeros(n,np.float32)
    vib=1+0.0025*np.sin(2*np.pi*4.7*t+rng.uniform(0,6.28))*np.minimum(1,t/2)
    for dc in detunes:
        f=f0*2**(dc/1200.0); ph=2*np.pi*np.cumsum(f*vib)/SR+rng.uniform(0,6.28)
        for k in range(1,40):
            if f*k>maxf: break
            out+=np.sin(k*ph)/k**1.15*(1/(1+(f*k/maxf)**4))
    return out*env(n,att,rel)/len(detunes)

def solo(m,dur,vel=1.0):
    n=int(dur*SR); t=np.arange(n)/SR; f0=mtof(m); out=np.zeros(n,np.float32)
    vib=1+0.004*np.sin(2*np.pi*5.2*t)*np.minimum(1,np.maximum(0,(t-0.4)/0.8))
    for dc in (-5,5):
        f=f0*2**(dc/1200.0); ph=2*np.pi*np.cumsum(f*vib)/SR+rng.uniform(0,6.28)
        for k in range(1,30):
            if f*k>3200: break
            out+=np.sin(k*ph)/k**1.3/(1+(f*k/2200)**4)
    return out*env(n,0.28,0.7)*vel*0.5

FORM={'a':[(700,90,1.0),(1150,110,0.5),(2600,200,0.12)],'o':[(450,80,1.0),(800,90,0.45),(2500,200,0.08)],'u':[(330,70,1.0),(700,80,0.25),(2400,200,0.05)]}
def choir(m,dur,vowel='a'):
    n=int(dur*SR); t=np.arange(n)/SR; f0=mtof(m); out=np.zeros(n,np.float32)
    form=FORM[vowel]
    for dc in (-14,-4,6,15):
        f=f0*2**(dc/1200.0); vib=1+0.0035*np.sin(2*np.pi*5.0*t+rng.uniform(0,6.28))
        ph=2*np.pi*np.cumsum(f*vib)/SR+rng.uniform(0,6.28)
        for k in range(1,45):
            fk=f*k
            if fk>3500: break
            g=sum(a*np.exp(-0.5*((fk-fc)/bw)**2) for fc,bw,a in form)+0.02
            out+=g*np.sin(k*ph)/k**0.6
    return out*env(n,2.2,2.8)/4*0.6

def bass(m,dur):
    n=int(dur*SR); t=np.arange(n)/SR; f=mtof(m)
    out=np.sin(2*np.pi*f*t)+0.3*np.sin(4*np.pi*f*t)+0.08*np.sin(6*np.pi*f*t)
    return out.astype(np.float32)*env(n,0.9,1.8)*0.5

# ---- composition: D dorian
D,E,F,G,A,B,C=2,4,5,7,9,11,0
CH={'Dm':(38,[50,57,62,65,69]),'C':(36,[48,55,60,64,67]),'F':(41,[53,57,60,65,69]),'G':(43,[55,59,62,67,71]),'Am':(45,[57,60,64,69,72]),'Em':(40,[52,59,64,67,71])}
PA=['Dm','C','F','C','Dm','G','Am','Dm']
PB=['F','C','G','Dm','F','C','Am','Dm']
cycles=[PA,PA,PB,PB,PA]
# melody per cycle: list of (beat, midi, dur beats)
MA=[(0,69,3),(3,67,1),(4,64,2),(6,67,2),(8,65,3),(11,69,1),(12,72,3),(15,71,1),(16,69,4),(20,67,2),(22,71,2),(24,69,3),(27,67,1),(28,64,2),(30,65,2)]
MA2=[(0,74,3),(3,72,1),(4,71,2),(6,67,2),(8,69,3),(11,72,1),(12,71,2),(14,67,2),(16,65,2),(18,64,2),(20,67,2),(22,71,2),(24,69,2),(26,65,2),(28,62,4)]
MB=[(0,72,2),(2,69,2),(4,67,3),(7,64,1),(8,71,3),(11,67,1),(12,69,4),(16,65,2),(18,69,2),(20,72,4),(24,74,3),(27,72,1),(28,69,4)]
MB2=[(0,77,2),(2,74,2),(4,72,3),(7,67,1),(8,71,3),(11,74,1),(12,76,4),(16,72,2),(18,69,2),(20,67,2),(22,71,2),(24,69,4),(28,62,4)]
mel={1:MA,2:MB,3:MB2}
LAY=[ # pad, bass, harp, bell, solo, choir, harpvel
 dict(pad=1.0,bass=0.9,harp=0.0,bell=0.5,solo=None,choir=0.0),
 dict(pad=0.9,bass=0.9,harp=1.0,bell=0.7,solo=MA,choir=0.0),
 dict(pad=1.0,bass=1.0,harp=0.8,bell=0.6,solo=MB,choir=1.0),
 dict(pad=1.0,bass=1.0,harp=1.0,bell=0.9,solo=MB2,choir=1.0),
 dict(pad=0.8,bass=0.7,harp=0.7,bell=0.5,solo=MA2,choir=0.55),
]
bar=4*BEAT
for ci,(prog,lay) in enumerate(zip(cycles,LAY)):
    for bi,name in enumerate(prog):
        t0=(ci*8+bi)*bar
        root,notes=CH[name]
        # pad (strings)
        for i,m in enumerate(notes[:4]):
            place(stringpad(m,bar+3.2),t0-0.3,pan=(-0.5+0.33*i),gain=0.20*lay['pad'])
        place(bass(root,bar+1.5),t0-0.05,0,gain=0.55*lay['bass'])
        if lay['choir']>0:
            for i,m in enumerate([notes[2],notes[3],notes[4]-0 ]):
                if bi%2==0:
                    place(choir(m+(0 if i<2 else -12)+0,2*bar+1.5,'a' if (bi//2)%2==0 else 'o'),t0-0.4,pan=(-0.4+0.4*i),gain=0.22*lay['choir'])
        if lay['harp']>0:
            pat=[0,2,4,3,1,3,2,4] if bi%2==0 else [0,1,3,4,2,4,3,1]
            for j,pi in enumerate(pat):
                m=notes[pi]+12*(1 if pi<2 else 0)
                tt=t0+j*BEAT*0.5+rng.normal(0,0.006)
                vel=lay['harp']*(0.9 if j%2==0 else 0.6)*rng.uniform(0.85,1.05)
                place(harp(m,vel),max(tt,0),pan=-0.3+0.15*j/2,gain=0.9)
        if lay['bell']>0 and bi%2==1:
            sc=[74,76,77,79,81,83,84,86]
            ch=[n%12 for n in notes]
            cand=[x for x in sc if x%12 in ch]
            m=cand[(bi+ci)%len(cand)]
            place(bell(m,lay['bell']),t0+BEAT*(2 if (bi+ci)%3 else 1.5),pan=0.45 if bi%4==1 else -0.45,gain=0.8)
    if lay['solo']:
        for (b,m,d) in lay['solo']:
            place(solo(m,d*BEAT+0.9),ci*8*bar+b*BEAT,pan=0.1,gain=0.30)

# ---- circular reverb
def make_ir(seed,rt=4.2,length=5.5):
    r=np.random.default_rng(seed); n=int(length*SR)
    x=r.standard_normal(n)
    X=np.fft.rfft(x); fr=np.fft.rfftfreq(n,1/SR)
    X*=1/(1+(fr/5000.0)**2)   # darker tail
    x=np.fft.irfft(X,n)
    t=np.arange(n)/SR
    # frequency-dependent decay approx: later = darker via second lowpassed copy
    y=x*np.exp(-6.9*t/rt)
    X2=np.fft.rfft(x); X2*=1/(1+(fr/1400.0)**2); z=np.fft.irfft(X2,n)*np.exp(-6.9*t/(rt*1.4))
    ir=y*0.5+z*1.2
    ir[:int(0.02*SR)]*=np.linspace(0,1,int(0.02*SR))  # soft onset
    ir/=np.sqrt((ir**2).sum())
    return ir.astype(np.float32)
def crev(x,ir):
    X=np.fft.rfft(x); H=np.fft.rfft(ir,N)
    return np.fft.irfft(X*H,N).astype(np.float32)
wetL=crev(L,make_ir(1)); wetR=crev(R,make_ir(2))
# high-pass DC / sub rumble and gentle tilt via FFT on whole circular signal
def shape(x):
    X=np.fft.rfft(x); fr=np.fft.rfftfreq(N,1/SR)
    X*=(1/(1+(30.0/np.maximum(fr,1))**4))        # HP 30Hz
    X*=1/(1+(fr/9000.0)**4)                       # LP 9k
    return np.fft.irfft(X,N).astype(np.float32)
outL=shape(L*0.55+wetL*1.9); outR=shape(R*0.55+wetR*1.9)
out=np.stack([outL,outR],1)
pk=np.abs(out).max(); out=out/pk*0.7
pcm=(out*32767).astype(np.int16)
with wave.open('ambient.wav','wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('dur',N/SR,'peak',pk)
