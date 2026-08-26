// Device Fingerprint generator (canvas + browser attributes hash)
function getDeviceId() {
  let deviceId = localStorage.getItem('pricefinder_device_id');
  if (!deviceId) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const txt = 'pricefinder_id_' + navigator.userAgent + '_' + screen.width + 'x' + screen.height;
    ctx.textBaseline = 'top';
    ctx.font = "14px 'Arial'";
    ctx.fillText(txt, 2, 2);
    const dataUrl = canvas.toDataURL();
    let hash = 0;
    for (let i = 0; i < dataUrl.length; i++) {
      hash = (hash << 5) - hash + dataUrl.charCodeAt(i);
      hash |= 0;
    }
    deviceId = 'DEV_' + Math.abs(hash);
    localStorage.setItem('pricefinder_device_id', deviceId);
  }
  return deviceId;
}

const DEVICE_ID = getDeviceId();

// Elements
const scrapeForm = document.getElementById('scrapeForm');
const productUrlInput = document.getElementById('productUrl');
const submitBtn = document.getElementById('submitBtn');
const usageBadge = document.getElementById('usageBadge');
const statusSection = document.getElementById('statusSection');
const resultsSection = document.getElementById('resultsSection');

const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');
const step4 = document.getElementById('step4');
const step5 = document.getElementById('step5');

const productImg = document.getElementById('productImg');
const productTitle = document.getElementById('productTitle');
const productBrand = document.getElementById('productBrand');
const sourceDomain = document.getElementById('sourceDomain');
const sourcePrice = document.getElementById('sourcePrice');
const resultsTableBody = document.getElementById('resultsTableBody');

const payModal = document.getElementById('payModal');
const payNowBtn = document.getElementById('payNowBtn');

// Fetch initial usage limit
async function updateUsage() {
  try {
    const res = await fetch('/api/usage', {
      headers: { 'x-device-id': DEVICE_ID }
    });
    const data = await res.json();

    if (data.isPaid) {
      usageBadge.innerHTML = '⚡ Status: <strong>Unlimited Access (Paid)</strong>';
      usageBadge.style.borderColor = '#10b981';
      usageBadge.style.color = '#10b981';
    } else {
      usageBadge.innerHTML = `Remaining Free Searches Today: <strong>${data.remaining} / 5</strong>`;
    }
  } catch (err) {
    usageBadge.innerText = 'Device Status: Ready';
  }
}

updateUsage();

// Animate pipeline steps sequentially
function updatePipelineStep(stepNumber) {
  const steps = [step1, step2, step3, step4, step5];
  steps.forEach((s, idx) => {
    if (idx + 1 === stepNumber) {
      s.classList.add('active');
    } else {
      s.classList.remove('active');
    }
  });
}

scrapeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = productUrlInput.value.trim();
  if (!url) return;

  statusSection.classList.remove('hidden');
  resultsSection.classList.add('hidden');
  submitBtn.disabled = true;

  // Pipeline execution step visual animation
  updatePipelineStep(1);
  await new Promise(r => setTimeout(r, 400));
  updatePipelineStep(2);
  await new Promise(r => setTimeout(r, 400));
  updatePipelineStep(3);

  try {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': DEVICE_ID
      },
      body: JSON.stringify({ url })
    });

    if (res.status === 402) {
      statusSection.classList.add('hidden');
      submitBtn.disabled = false;
      payModal.classList.remove('hidden');
      return;
    }

    updatePipelineStep(4);
    await new Promise(r => setTimeout(r, 300));
    updatePipelineStep(5);

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Scraping failed');
    }

    renderResults(data);
    updateUsage();
  } catch (err) {
    alert(err.message || 'Error occurred while processing link.');
  } finally {
    statusSection.classList.add('hidden');
    submitBtn.disabled = false;
  }
});

function renderResults(data) {
  const { product, results } = data;

  productTitle.innerText = product.title || 'Product';
  productBrand.innerText = product.brand || 'General';
  sourceDomain.innerText = `Source: ${product.domain || 'Direct Link'}`;
  sourcePrice.innerText = product.price ? `Original Price: ₹${product.price.toLocaleString('en-IN')}` : 'Price extracted below';
  productImg.src = product.image || 'https://via.placeholder.com/100?text=Product';

  resultsTableBody.innerHTML = '';

  results.forEach((item, index) => {
    const tr = document.createElement('tr');
    if (index === 0) {
      tr.classList.add('lowest-row');
    }

    tr.innerHTML = `
      <td>${index === 0 ? '🏆 #1 Lowest' : `#${index + 1}`}</td>
      <td><strong>${item.platform}</strong></td>
      <td class="price-cell">₹${item.price.toLocaleString('en-IN')}</td>
      <td><span style="color: #94a3b8">${item.shipping}</span></td>
      <td>⭐ ${item.rating}</td>
      <td>
        <a href="${item.searchUrl}" target="_blank" rel="noopener noreferrer" class="buy-btn">
          Buy Now ↗
        </a>
      </td>
    `;
    resultsTableBody.appendChild(tr);
  });

  resultsSection.classList.remove('hidden');
}

// Payment simulation
payNowBtn.addEventListener('click', async () => {
  payNowBtn.innerText = 'Processing Payment...';
  try {
    const res = await fetch('/api/pay', {
      method: 'POST',
      headers: {
        'x-device-id': DEVICE_ID
      }
    });
    const data = await res.json();
    if (data.success) {
      alert('Payment Successful! You now have unlimited searches.');
      payModal.classList.add('hidden');
      updateUsage();
    }
  } catch (err) {
    alert('Payment failed. Try again.');
  } finally {
    payNowBtn.innerText = 'Pay ₹100 & Unlock Unlimited';
  }
});
